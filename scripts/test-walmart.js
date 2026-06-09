// Step 2 of the build plan: validate the Walmart scraper's data shape.
// Usage: node scripts/test-walmart.js [itemId]
// With no argument it checks every walmart product in products.json.
import { checkWalmart } from "../src/scrapers/walmart.js";
import { loadProducts } from "../src/config.js";

const arg = process.argv[2];
const targets = arg
  ? [{ store: "walmart", id: arg, name: `(item ${arg})` }]
  : loadProducts().filter((p) => p.store === "walmart");

if (targets.length === 0) {
  console.log("No walmart products in products.json and no itemId argument given.");
  process.exit(1);
}

let failed = false;
for (const t of targets) {
  const r = await checkWalmart(t);
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) failed = true;
}
process.exit(failed ? 1 : 0);
