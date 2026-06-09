import Database from "better-sqlite3";
import { config } from "./config.js";

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS stock_state (
    store      TEXT NOT NULL,
    product_id TEXT NOT NULL,
    in_stock   INTEGER NOT NULL,
    status     TEXT,
    price      REAL,
    name       TEXT,
    checked_at TEXT NOT NULL,
    PRIMARY KEY (store, product_id)
  )
`);

for (const ddl of [
  "ALTER TABLE stock_state ADD COLUMN last_alert_at TEXT",
  "ALTER TABLE stock_state ADD COLUMN out_streak INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.exec(ddl);
  } catch {
    // column already exists
  }
}

const getStmt = db.prepare("SELECT * FROM stock_state WHERE store = ? AND product_id = ?");
const alertStmt = db.prepare(
  "UPDATE stock_state SET last_alert_at = ? WHERE store = ? AND product_id = ?"
);
const upsertStmt = db.prepare(`
  INSERT INTO stock_state (store, product_id, in_stock, status, price, name, checked_at, out_streak)
  VALUES (@store, @product_id, @in_stock, @status, @price, @name, @checked_at, @out_streak)
  ON CONFLICT (store, product_id) DO UPDATE SET
    in_stock = @in_stock, status = @status, price = @price, name = @name,
    checked_at = @checked_at, out_streak = @out_streak
`);

export function getLastState(store, productId) {
  return getStmt.get(store, productId) ?? null;
}

export function markAlerted(store, productId) {
  alertStmt.run(new Date().toISOString(), store, productId);
}

export function saveState(state, outStreak = 0) {
  upsertStmt.run({
    store: state.store,
    product_id: state.id,
    in_stock: state.inStock ? 1 : 0,
    status: state.status,
    price: state.price,
    name: state.name,
    checked_at: new Date().toISOString(),
    out_streak: outStreak,
  });
}
