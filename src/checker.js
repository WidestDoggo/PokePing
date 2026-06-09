import { checkWalmart } from "./scrapers/walmart.js";
import { getLastState, saveState } from "./db.js";
import { buildRestockEmbed, postToDiscord } from "./notify/discord.js";

const SCRAPERS = {
  walmart: checkWalmart,
  // bestbuy: checkBestBuy,  (Puppeteer + stealth — next phase)
};

/**
 * One full pass: scrape every product, diff against cached state,
 * alert on out-of-stock -> in-stock transitions, persist new state.
 */
export async function runCheck(products, { log = console } = {}) {
  const pending = []; // [{ embed, state }] — saved only after Discord accepts the alert

  for (const product of products) {
    const scraper = SCRAPERS[product.store];
    if (!scraper) {
      log.warn(`[skip] no scraper for store "${product.store}" (${product.name})`);
      continue;
    }

    let state;
    try {
      state = await scraper(product);
    } catch (e) {
      log.error(`[error] ${product.store}/${product.id}: ${e.message}`);
      continue;
    }

    if (!state.ok) {
      // Scrape failure: don't touch cached state, so a transient block
      // can't fake an out-of-stock and trigger a false alert later.
      log.warn(`[${state.error}] ${product.store}/${product.id}: ${state.detail}`);
      continue;
    }

    const last = getLastState(state.store, state.id);
    log.info(
      `[ok] ${state.store}/${state.id} "${state.name}" -> ${state.status}` +
        (state.price != null ? ` @ $${state.price}` : "")
    );

    // Restock = a known out-of-stock item flipped to in stock. The very first
    // sighting of a product only seeds the cache — no alert spam on first run.
    const restocked = state.inStock && last !== null && last.in_stock === 0;
    if (restocked) {
      pending.push({ embed: buildRestockEmbed(product, state), state });
    } else {
      saveState(state);
    }
  }

  if (pending.length > 0) {
    // Discord caps embeds at 10 per message. State for alerted items is saved
    // only after a successful post, so a failed post retries next pass.
    for (let i = 0; i < pending.length; i += 10) {
      const batch = pending.slice(i, i + 10);
      await postToDiscord(batch.map((b) => b.embed), "@here Restock detected!");
      for (const b of batch) saveState(b.state);
    }
    log.info(`[alert] posted ${pending.length} restock alert(s) to Discord`);
  }

  return pending.length;
}
