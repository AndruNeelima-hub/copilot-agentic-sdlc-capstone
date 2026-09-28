CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  disabled_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  order_number TEXT NOT NULL UNIQUE,
  order_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded', 'Returned'
  )),
  subtotal REAL NOT NULL CHECK (subtotal >= 0),
  tax REAL NOT NULL CHECK (tax >= 0),
  shipping REAL NOT NULL CHECK (shipping >= 0),
  discount REAL NOT NULL CHECK (discount >= 0),
  total REAL NOT NULL CHECK (total >= 0),
  currency TEXT(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  line_total REAL NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_user_date
  ON orders (user_id, order_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_orders_user_status_date
  ON orders (user_id, status, order_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_orders_user_total
  ON orders (user_id, total DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items (order_id, id);