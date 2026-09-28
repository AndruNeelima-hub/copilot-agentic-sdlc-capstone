const path = require('node:path');
const { createDatabase } = require('./database');

const USER_IDS = Object.freeze({
  history: '00000000-0000-4000-8000-000000000001',
  empty: '00000000-0000-4000-8000-000000000002',
  disabled: '00000000-0000-4000-8000-000000000003',
  deleted: '00000000-0000-4000-8000-000000000004',
  largeHistory: '00000000-0000-4000-8000-000000000005'
});

const STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded', 'Returned'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'JPY'];
const BASE_DATE = Date.UTC(2025, 0, 1);

function generatedId(prefix, number) {
  return `${prefix}-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function createOrder(insertOrder, { prefix, index, userId }) {
  const day = index % 365;
  const orderDate = new Date(BASE_DATE + day * 24 * 60 * 60 * 1000 + (index % 24) * 60 * 60 * 1000)
    .toISOString();
  const subtotal = (index % 500) + 10;
  const tax = Number((subtotal * 0.08).toFixed(2));
  const shipping = index % 20 === 0 ? 0 : 5;
  const discount = index % 10;

  insertOrder.run(
    generatedId(prefix, index),
    userId,
    `SEED-${prefix}-${String(index).padStart(6, '0')}`,
    orderDate,
    STATUSES[index % STATUSES.length],
    subtotal,
    tax,
    shipping,
    discount,
    Number((subtotal + tax + shipping - discount).toFixed(2)),
    CURRENCIES[index % CURRENCIES.length]
  );
}

function seedDatabase(db) {
  const seed = db.transaction(() => {
    const insertUser = db.prepare(`
      INSERT INTO users (id, status, disabled_at, deleted_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        disabled_at = excluded.disabled_at,
        deleted_at = excluded.deleted_at
    `);
    const now = '2025-01-01T00:00:00.000Z';

    insertUser.run(USER_IDS.history, 'active', null, null);
    insertUser.run(USER_IDS.empty, 'active', null, null);
    insertUser.run(USER_IDS.disabled, 'disabled', now, null);
    insertUser.run(USER_IDS.deleted, 'active', null, now);
    insertUser.run(USER_IDS.largeHistory, 'active', null, null);

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, user_id, order_number, order_date, status, subtotal, tax,
        shipping, discount, total, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        order_number = excluded.order_number,
        order_date = excluded.order_date,
        status = excluded.status,
        subtotal = excluded.subtotal,
        tax = excluded.tax,
        shipping = excluded.shipping,
        discount = excluded.discount,
        total = excluded.total,
        currency = excluded.currency
    `);

    for (let index = 1; index <= 70; index += 1) {
      createOrder(insertOrder, { prefix: '10000000', index, userId: USER_IDS.history });
    }

    for (let index = 1; index <= 10000; index += 1) {
      createOrder(insertOrder, { prefix: '20000000', index, userId: USER_IDS.largeHistory });
    }

    const sampleOrderId = generatedId('10000000', 1);
    const insertItem = db.prepare(`
      INSERT OR IGNORE INTO order_items
        (id, order_id, product_name, sku, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertItem.run('30000000-0000-4000-8000-000000000001', sampleOrderId, 'Seed Item A', 'SEED-A', 1, 12, 12);
    insertItem.run('30000000-0000-4000-8000-000000000002', sampleOrderId, 'Seed Item B', 'SEED-B', 2, 4, 8);
  });

  seed();
}

if (require.main === module) {
  const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, 'order-history.sqlite'));
  const db = createDatabase(dbPath);

  try {
    seedDatabase(db);
    console.log(`Seed completed in ${dbPath}`);
    console.log(`History user: ${USER_IDS.history}`);
    console.log(`Empty-history user: ${USER_IDS.empty}`);
    console.log(`Disabled user: ${USER_IDS.disabled}`);
    console.log(`Soft-deleted user: ${USER_IDS.deleted}`);
    console.log(`Large-history user (10,000 orders): ${USER_IDS.largeHistory}`);
  } finally {
    db.close();
  }
}

module.exports = { USER_IDS, seedDatabase };