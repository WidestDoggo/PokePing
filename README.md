# PokePing

Pokémon TCG restock alerter for Canadian stores. Scrapes product pages on a cron
schedule, diffs against the last known state in SQLite, and posts a Discord
webhook embed (name, price, buy link) when something flips from out-of-stock to
in stock.

```
cron -> store scrapers -> stock checker -> (diff vs SQLite cache) -> alert builder -> Discord webhook
```

Stores: **Walmart Canada** (live, plain HTTP — walmart.ca embeds product JSON in
`__NEXT_DATA__`). Best Buy Canada (Puppeteer + stealth) is the planned next
scraper. Target has no Canadian stores, so that branch of the original design is
dropped.

## Setup

1. `npm install`
2. `copy .env.example .env` and paste your webhook URL into `DISCORD_WEBHOOK_URL`
   (Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL)
3. `npm run test:webhook` — posts a test embed; confirm it shows up in your channel
4. Edit `products.json` — find item IDs with `npm run find -- "pokemon 151 booster bundle"`
5. `npm start`

The first pass seeds the cache silently (no alert spam for items already in
stock). After that, any out-of-stock → in-stock transition posts an alert.
`CHECK_INTERVAL_CRON` in `.env` controls the schedule (default every 5 minutes).

## Useful commands

| Command | What it does |
|---|---|
| `npm start` | Run the cron loop |
| `npm run test:webhook` | Post a test embed to Discord |
| `npm run test:walmart` | Scrape every Walmart product once, print raw results |
| `npm run find -- "query"` | Search walmart.ca, print item IDs for products.json |

## Deploy (cheap VPS)

Works on a $5 DigitalOcean droplet or an Oracle Cloud Always-Free instance
(VM.Standard.A1.Flex, on-demand capacity). Only outbound traffic is needed —
no ingress ports to open.

First install Node 22 and git:

```bash
# Ubuntu 24.04 (apt's nodejs is too old — use NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git

# Oracle Linux 9
sudo dnf module install -y nodejs:22/common
sudo dnf install -y git
```

Then deploy:

```bash
sudo useradd -r pokeping
sudo git clone https://github.com/WidestDoggo/PokePing.git /opt/pokeping
sudo chown -R pokeping: /opt/pokeping
cd /opt/pokeping && sudo -u pokeping npm install --omit=dev
sudo -u pokeping cp .env.example .env
sudoedit -u pokeping /opt/pokeping/.env   # paste webhook URL
sudo cp deploy/pokeping.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now pokeping
journalctl -u pokeping -f
```

Note: `better-sqlite3` ships prebuilt binaries — the DB file (`pokeping.db`) is
machine-local, so don't copy it between machines; it reseeds itself on first run.

## Notes / limits

- Scrape failures (bot challenge, HTTP errors, layout changes) are logged and
  the cached state is left untouched, so a transient block can never fake an
  out-of-stock and cause a false alert later.
- If a Discord post fails, the alerted items' state is not saved — the alert
  retries on the next pass instead of being lost.
- Keep the interval civil (≥ 2–3 min). Hammering walmart.ca will get the VPS IP
  served bot challenges; the scraper detects and logs those rather than crashing.
