import axios from "axios";
import { config } from "../config.js";

/**
 * Walmart Canada scraper.
 *
 * walmart.ca runs on the same Next.js platform as walmart.com, so every product
 * page embeds its full data as JSON in <script id="__NEXT_DATA__">. We fetch the
 * page HTML and read the product object out of that blob — no headless browser
 * needed unless bot protection kicks in.
 *
 * products.json entry shape: { "store": "walmart", "id": "<itemId>", "name": "..." }
 * where <itemId> is the trailing number in the product URL:
 *   https://www.walmart.ca/en/ip/<slug>/<itemId>
 */

const HEADERS = {
  "User-Agent": config.userAgent,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-CA,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
};

export function productUrl(id) {
  return `https://www.walmart.ca/en/ip/${id}`;
}

export async function checkWalmart(product) {
  const url = productUrl(product.id);
  const res = await axios.get(url, {
    headers: HEADERS,
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: () => true,
  });

  if (res.status === 412 || /Robot or human|px-captcha/i.test(String(res.data).slice(0, 5000))) {
    return { ok: false, error: "blocked", detail: `Bot challenge (HTTP ${res.status})`, url };
  }
  if (res.status !== 200) {
    return { ok: false, error: "http", detail: `HTTP ${res.status}`, url };
  }

  const match = String(res.data).match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.+?)<\/script>/s
  );
  if (!match) {
    return { ok: false, error: "parse", detail: "__NEXT_DATA__ not found in page", url };
  }

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (e) {
    return { ok: false, error: "parse", detail: `JSON parse failed: ${e.message}`, url };
  }

  const p = data?.props?.pageProps?.initialData?.data?.product;
  if (!p) {
    return { ok: false, error: "shape", detail: "product object missing at props.pageProps.initialData.data.product", url };
  }

  // Validate the data shape we depend on, loudly, so layout changes surface fast.
  const status = p.availabilityStatus;
  if (typeof status !== "string") {
    return { ok: false, error: "shape", detail: `availabilityStatus is ${typeof status}`, url };
  }

  return {
    ok: true,
    store: "walmart",
    id: product.id,
    name: p.name ?? product.name,
    status, // e.g. "IN_STOCK" | "OUT_OF_STOCK"
    inStock: status === "IN_STOCK",
    price: p.priceInfo?.currentPrice?.price ?? null,
    url: p.canonicalUrl ? `https://www.walmart.ca${p.canonicalUrl}` : url,
  };
}
