import cron from "node-cron";
import { config, loadProducts, assertWebhookConfigured } from "./config.js";
import { runCheck } from "./checker.js";

assertWebhookConfigured();
const products = loadProducts();

console.log(`PokePing started: ${products.length} product(s), schedule "${config.checkIntervalCron}"`);

let running = false;
async function tick() {
  if (running) return; // skip overlapping runs if a check outlasts the interval
  running = true;
  try {
    await runCheck(products);
  } catch (e) {
    console.error(`[fatal] check pass failed: ${e.message}`);
  } finally {
    running = false;
  }
}

cron.schedule(config.checkIntervalCron, tick);
tick(); // run immediately on startup
