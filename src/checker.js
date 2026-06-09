import { checkWalmart } from "./scrapers/walmart.js";
import { checkWalmartCategory } from "./scrapers/walmartCategory.js";
import { getLastState, saveState, markAlerted } from "./db.js";
import { buildRestockEmbed, postToDiscord } from "./notify/discord.js";
import { config } from "./config.js";

const SCRAPERS = {
  walmart: checkWalmart,
  // bestbuy: checkBestBuy,  (Puppeteer + stealth — next phase)
};

const CONFIRM_DELAY_MS = 600;
// Listing data flickers in both directions (fulfillment context varies per
// request), so an item is only recorded out-of-stock after this many
// consecutive passes agree. Genuine sellouts persist; flicker doesn't.
const OUT_CONFIRM_PASSES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withinCooldown(last) {
  if (!last?.last_alert_at) return false;
  const hours = (Date.now() - Date.parse(last.last_alert_at)) / 3.6e6;
  return hours < config.alertCooldownHours;
}

/**
 * One full pass: scrape every watch entry, diff against cached state,
 * alert on out-of-stock -> in-stock transitions, persist new state.
 *
 * Category listings are treated as a cheap radar only: walmart.ca search
 * results flicker (marketplace offers rotate), so every suspected restock
 * is confirmed against the product page — the authoritative source —
 * before it can alert. A per-item cooldown stops flicker re-alerts.
 */
export async function runCheck(products, { log = console } = {}) {
  const pending = []; // [{ embed, state }] — saved only after Discord accepts the alert
  const candidates = []; // category-sourced restocks awaiting product-page confirmation

  for (const product of products) {
    try {
      if (product.type === "category") {
        const result = await checkWalmartCategory(product);
        for (const e of result.errors) {
          log.warn(`[${e.error}] ${product.name}: ${e.detail} (${e.url})`);
        }
        log.info(`[ok] category "${product.name}": ${result.states.length} item(s) checked`);
        for (const state of result.states) {
          const last = getLastState(state.store, state.id);
          if (last === null) {
            // First sighting: seed as in-stock regardless of what the listing
            // says (listing out-of-stock is too noisy to trust on its own).
            // If it's genuinely out, the streak below marks it within a few passes.
            saveState({ ...state, inStock: true }, state.inStock ? 0 : 1);
          } else if (state.inStock) {
            if (last.in_stock === 0) {
              candidates.push({ product, state, last });
            } else {
              saveState(state, 0);
            }
          } else if (last.in_stock === 1) {
            const streak = (last.out_streak ?? 0) + 1;
            if (streak >= OUT_CONFIRM_PASSES) {
              log.info(`[sold-out] ${state.id} "${state.name}" (${streak} consecutive passes)`);
              saveState(state, 0); // now armed for a restock alert
            } else {
              saveState({ ...state, inStock: true }, streak); // not confirmed out yet
            }
          } else {
            saveState(state, 0); // still out
          }
        }
        continue;
      }

      const scraper = SCRAPERS[product.store];
      if (!scraper) {
        log.warn(`[skip] no scraper for store "${product.store}" (${product.name})`);
        continue;
      }
      const state = await scraper(product);
      if (!state.ok) {
        // Scrape failure: don't touch cached state, so a transient block
        // can't fake an out-of-stock and trigger a false alert later.
        log.warn(`[${state.error}] ${product.store}/${product.id}: ${state.detail}`);
        continue;
      }
      log.info(
        `[ok] ${state.store}/${state.id} "${state.name}" -> ${state.status}` +
          (state.price != null ? ` @ $${state.price}` : "")
      );
      const last = getLastState(state.store, state.id);
      if (state.inStock && last !== null && last.in_stock === 0 && !withinCooldown(last)) {
        log.info(`[restock] ${state.store}/${state.id} "${state.name}" @ $${state.price}`);
        pending.push({ embed: buildRestockEmbed(product, state), state });
      } else {
        saveState(state);
      }
    } catch (e) {
      log.error(`[error] ${product.store}/${product.id ?? product.name}: ${e.message}`);
    }
  }

  // Confirm category-sourced candidates against their product pages.
  for (const { product, state, last } of candidates) {
    if (withinCooldown(last)) {
      saveState(state); // recently alerted — just track the new state quietly
      continue;
    }
    let confirm;
    try {
      confirm = await checkWalmart({ store: "walmart", id: state.id, name: state.name });
    } catch (e) {
      log.warn(`[confirm-error] ${state.id}: ${e.message}`);
      continue; // leave cached state untouched; we'll re-check next pass
    }
    await sleep(CONFIRM_DELAY_MS);
    if (!confirm.ok) {
      log.warn(`[confirm-${confirm.error}] ${state.id}: ${confirm.detail}`);
      continue;
    }
    if (confirm.inStock) {
      log.info(`[restock] ${confirm.store}/${confirm.id} "${confirm.name}" @ $${confirm.price} (confirmed)`);
      pending.push({ embed: buildRestockEmbed(product, confirm), state: confirm });
    } else {
      log.info(`[flicker] ${state.id} "${state.name}": listing said in stock, product page says ${confirm.status}`);
      saveState(confirm); // page is authoritative
    }
  }

  if (pending.length > 0) {
    // Discord caps embeds at 10 per message. State for alerted items is saved
    // only after a successful post, so a failed post retries next pass.
    for (let i = 0; i < pending.length; i += 10) {
      const batch = pending.slice(i, i + 10);
      await postToDiscord(batch.map((b) => b.embed), "@here Restock detected!");
      for (const b of batch) {
        saveState(b.state);
        markAlerted(b.state.store, b.state.id);
      }
    }
    log.info(`[alert] posted ${pending.length} restock alert(s) to Discord`);
  }

  return pending.length;
}
