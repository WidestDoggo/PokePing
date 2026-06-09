import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const config = {
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  checkIntervalCron: process.env.CHECK_INTERVAL_CRON ?? "*/5 * * * *",
  dbPath: process.env.DB_PATH ?? path.join(root, "pokeping.db"),
  userAgent:
    process.env.USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
};

export function loadProducts() {
  const raw = readFileSync(path.join(root, "products.json"), "utf8");
  const products = JSON.parse(raw);
  for (const p of products) {
    if (!p.store || !p.id || !p.name) {
      throw new Error(`products.json entry missing store/id/name: ${JSON.stringify(p)}`);
    }
  }
  return products;
}

export function assertWebhookConfigured() {
  if (!config.discordWebhookUrl || !config.discordWebhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    throw new Error(
      "DISCORD_WEBHOOK_URL is not set. Copy .env.example to .env and paste your webhook URL " +
        "(Discord: channel settings -> Integrations -> Webhooks -> New Webhook -> Copy Webhook URL)."
    );
  }
}
