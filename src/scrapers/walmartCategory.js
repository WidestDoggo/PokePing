import axios from "axios";
import { config } from "../config.js";

/**
 * Walmart Canada category/search watcher.
 *
 * Instead of fetching one product page per watched item, this pulls search
 * result pages (~40 items each, with price + availability inline) and returns
 * a state for every item found. One pass over a whole category costs a few
 * dozen requests instead of hundreds.
 *
 * products.json entry shape:
 *   { "store": "walmart", "type": "category", "query": "pokemon trading cards",
 *     "name": "All Pokémon cards", "maxPages": 25 }
 */

const HEADERS = {
  "User-Agent": config.userAgent,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-CA,en;q=0.9",
};

const PAGE_DELAY_MS = 800; // stay polite between listing-page fetches

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseItems(html, url) {
  const match = String(html).match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.+?)<\/script>/s
  );
  if (!match) {
    if (/Robot or human|px-captcha/i.test(String(html).slice(0, 5000))) {
      return { error: "blocked", detail: "Bot challenge", url };
    }
    return { error: "parse", detail: "__NEXT_DATA__ not found", url };
  }
  const data = JSON.parse(match[1]);
  const stacks = data?.props?.pageProps?.initialData?.searchResult?.itemStacks ?? [];
  return { items: stacks.flatMap((s) => s.items ?? []) };
}

/** Returns { ok, states: [...], errors: [...] } covering every item found. */
export async function checkWalmartCategory(watch) {
  const maxPages = watch.maxPages ?? 25;
  const byId = new Map();
  const errors = [];

  for (let page = 1; page <= maxPages; page++) {
    const url =
      `https://www.walmart.ca/en/search?q=${encodeURIComponent(watch.query)}` +
      (page > 1 ? `&page=${page}` : "");

    let res;
    try {
      res = await axios.get(url, { headers: HEADERS, timeout: 30000, validateStatus: () => true });
    } catch (e) {
      errors.push({ error: "network", detail: e.message, url });
      break;
    }
    if (res.status !== 200) {
      errors.push({ error: "http", detail: `HTTP ${res.status}`, url });
      break;
    }

    const parsed = parseItems(res.data, url);
    if (parsed.error) {
      errors.push(parsed);
      break;
    }
    if (parsed.items.length === 0) break; // ran past the last page

    for (const i of parsed.items) {
      const id = i.usItemId ?? i.id;
      if (!id || byId.has(id)) continue;
      const status = i.availabilityStatusDisplayValue ?? i.availabilityStatus ?? "UNKNOWN";
      byId.set(id, {
        ok: true,
        store: "walmart",
        id: String(id),
        name: i.name ?? `(item ${id})`,
        status,
        inStock: /^in[ _]?stock$/i.test(status),
        price: typeof i.price === "number" ? i.price : null,
        url: i.canonicalUrl
          ? `https://www.walmart.ca${i.canonicalUrl}`
          : `https://www.walmart.ca/en/ip/${id}`,
      });
    }

    if (page < maxPages) await sleep(PAGE_DELAY_MS);
  }

  return { ok: errors.length === 0 || byId.size > 0, states: [...byId.values()], errors };
}
