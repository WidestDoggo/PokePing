// Helper: search walmart.ca and print item IDs to paste into products.json.
// Usage: node scripts/find-walmart.js "pokemon elite trainer box"
import axios from "axios";
import { config } from "../src/config.js";

const query = process.argv.slice(2).join(" ") || "pokemon trading cards";
const url = `https://www.walmart.ca/en/search?q=${encodeURIComponent(query)}`;

const res = await axios.get(url, {
  headers: {
    "User-Agent": config.userAgent,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-CA,en;q=0.9",
  },
  timeout: 30000,
  validateStatus: () => true,
});

if (res.status !== 200) {
  console.error(`Search request failed: HTTP ${res.status}`);
  process.exit(1);
}

const match = String(res.data).match(
  /<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.+?)<\/script>/s
);
if (!match) {
  console.error("__NEXT_DATA__ not found — page layout may have changed or request was challenged.");
  process.exit(1);
}

const data = JSON.parse(match[1]);
const stacks =
  data?.props?.pageProps?.initialData?.searchResult?.itemStacks ?? [];
const items = stacks.flatMap((s) => s.items ?? []).filter((i) => i.usItemId || i.id);

if (items.length === 0) {
  console.error("No items found in search result JSON. Raw keys:");
  console.error(Object.keys(data?.props?.pageProps?.initialData ?? {}));
  process.exit(1);
}

for (const i of items.slice(0, 20)) {
  console.log(
    `${i.usItemId ?? i.id}  ${i.availabilityStatusDisplayValue ?? i.availabilityStatus ?? "?"}  $${i.price ?? "?"}  ${i.name}`
  );
}
console.log(`\nproducts.json entry example:\n  { "store": "walmart", "id": "${items[0].usItemId ?? items[0].id}", "name": "${items[0].name}" }`);
