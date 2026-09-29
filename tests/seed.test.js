const { createDatabase } = require('../db/database');
const { USER_IDS, seedDatabase } = require('../db/seed');

describe('database seed', () => {
  let db;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  test('seeds consistent order items and is safe to rerun', () => {
    seedDatabase(db);

    const orderCounts = db.prepare(`
      SELECT user_id, count(*) AS count
      FROM orders
      WHERE user_id IN (?, ?)
      GROUP BY user_id
    `).all(USER_IDS.history, USER_IDS.largeHistory);
    expect(orderCounts).toEqual([
      { user_id: USER_IDS.history, count: 70 },
      { user_id: USER_IDS.largeHistory, count: 10000 }
    ]);

    expect(db.prepare("SELECT count(*) AS count FROM orders WHERE currency NOT GLOB '[A-Z][A-Z][A-Z]'")
      .get().count).toBe(0);

    const emptyOrderCount = db.prepare(`
      SELECT count(*) AS count
      FROM orders o
      LEFT JOIN order_items i ON i.order_id = o.id
      WHERE o.user_id IN (?, ?)
      GROUP BY o.id
      HAVING count(i.id) = 0
    `).all(USER_IDS.history, USER_IDS.largeHistory).length;
    expect(emptyOrderCount).toBe(2);

    const invalidOrders = db.prepare(`
      SELECT count(*) AS count
      FROM (
        SELECT o.id, o.subtotal, o.tax, o.shipping, o.discount, o.total,
          count(i.id) AS item_count, coalesce(sum(i.line_total), 0) AS item_subtotal
        FROM orders o
        LEFT JOIN order_items i ON i.order_id = o.id
        WHERE o.user_id IN (?, ?)
        GROUP BY o.id
        HAVING item_count NOT BETWEEN 1 AND 4 AND item_count <> 0
          OR round(o.subtotal, 2) <> round(item_subtotal, 2)
          OR round(o.total, 2) <> round(o.subtotal + o.tax + o.shipping - o.discount, 2)
      )
    `).get(USER_IDS.history, USER_IDS.largeHistory).count;
    expect(invalidOrders).toBe(0);

    const invalidItems = db.prepare(`
      SELECT count(*) AS count
      FROM order_items i
      JOIN orders o ON o.id = i.order_id
      WHERE o.user_id IN (?, ?)
        AND (i.quantity < 1 OR round(i.line_total, 2) <> round(i.quantity * i.unit_price, 2))
    `).get(USER_IDS.history, USER_IDS.largeHistory).count;
    expect(invalidItems).toBe(0);

    const itemStats = db.prepare(`
      SELECT count(*) AS item_count,
        count(DISTINCT product_name) AS product_count,
        count(DISTINCT sku) AS sku_count
      FROM order_items i
      JOIN orders o ON o.id = i.order_id
      WHERE o.user_id IN (?, ?)
    `).get(USER_IDS.history, USER_IDS.largeHistory);
    expect(itemStats.item_count).toBeGreaterThan(10000);
    expect(itemStats.product_count).toBeGreaterThan(1);
    expect(itemStats.sku_count).toBeGreaterThan(1);

    const countsBeforeRerun = {
      orders: db.prepare('SELECT count(*) AS count FROM orders').get().count,
      items: db.prepare('SELECT count(*) AS count FROM order_items').get().count
    };
    seedDatabase(db);
    expect(db.prepare('SELECT count(*) AS count FROM orders').get().count).toBe(countsBeforeRerun.orders);
    expect(db.prepare('SELECT count(*) AS count FROM order_items').get().count).toBe(countsBeforeRerun.items);
  });
});