// Step 1 of the build plan: confirm the Discord webhook posts correctly.
// Usage: node scripts/test-webhook.js
import { postToDiscord, buildRestockEmbed } from "../src/notify/discord.js";

const fakeProduct = { store: "walmart", id: "TEST", name: "Pokémon TCG Test Product" };
const fakeState = {
  name: "Pokémon TCG: Scarlet & Violet Elite Trainer Box (webhook test)",
  price: 64.97,
  status: "IN_STOCK",
  url: "https://www.walmart.ca/en/browse/toys/trading-cards/pokemon-cards/10845_30562_32606",
};

const status = await postToDiscord(
  [buildRestockEmbed(fakeProduct, fakeState)],
  "✅ PokePing webhook test — if you can read this, alerts are wired up."
);
console.log(`Webhook test OK (HTTP ${status}). Check your Discord channel.`);
