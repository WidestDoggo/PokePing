import axios from "axios";
import { config, assertWebhookConfigured } from "../config.js";

const STORE_COLORS = {
  walmart: 0x0071ce,
  bestbuy: 0xffe000,
  default: 0x2ecc71,
};

/**
 * Build the restock alert embed: name, price, buy link (per the alert-builder spec).
 * `product` is the entry from products.json, `state` is the scraped result.
 */
export function buildRestockEmbed(product, state) {
  return {
    title: `🟢 RESTOCK: ${state.name ?? product.name}`,
    url: state.url,
    color: STORE_COLORS[product.store] ?? STORE_COLORS.default,
    fields: [
      { name: "Store", value: storeLabel(product.store), inline: true },
      { name: "Price", value: state.price != null ? `$${state.price.toFixed(2)} CAD` : "Unknown", inline: true },
      { name: "Status", value: state.status, inline: true },
    ],
    description: `**[Buy now](${state.url})**`,
    footer: { text: "PokePing" },
    timestamp: new Date().toISOString(),
  };
}

function storeLabel(store) {
  return { walmart: "Walmart Canada", bestbuy: "Best Buy Canada", target: "Target" }[store] ?? store;
}

/** Post one or more embeds to the Discord webhook. */
export async function postToDiscord(embeds, content) {
  assertWebhookConfigured();
  const res = await axios.post(
    config.discordWebhookUrl,
    { username: "PokePing", content, embeds },
    { timeout: 15000 }
  );
  return res.status; // 204 on success
}
