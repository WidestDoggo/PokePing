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

const getStmt = db.prepare("SELECT * FROM stock_state WHERE store = ? AND product_id = ?");
const upsertStmt = db.prepare(`
  INSERT INTO stock_state (store, product_id, in_stock, status, price, name, checked_at)
  VALUES (@store, @product_id, @in_stock, @status, @price, @name, @checked_at)
  ON CONFLICT (store, product_id) DO UPDATE SET
    in_stock = @in_stock, status = @status, price = @price, name = @name, checked_at = @checked_at
`);

export function getLastState(store, productId) {
  return getStmt.get(store, productId) ?? null;
}

export function saveState(state) {
  upsertStmt.run({
    store: state.store,
    product_id: state.id,
    in_stock: state.inStock ? 1 : 0,
    status: state.status,
    price: state.price,
    name: state.name,
    checked_at: new Date().toISOString(),
  });
}
