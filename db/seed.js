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
const PRODUCTS = [
  { name: 'Canvas Backpack', sku: 'BAG-CANVAS' },
  { name: 'Wireless Earbuds', sku: 'AUDIO-WIRELESS' },
  { name: 'Insulated Bottle', sku: 'HOME-BOTTLE' },
  { name: 'Desk Lamp', sku: 'HOME-LAMP' },
  { name: 'Running Socks', sku: 'APP-SOCKS' },
  { name: 'Travel Charger', sku: 'TECH-CHARGER' },
  { name: 'Notebook Set', sku: 'OFFICE-NOTEBOOK' },
  { name: 'Ceramic Mug', sku: 'HOME-MUG' }
];
const BASE_DATE = Date.UTC(2025, 0, 1);

function generatedId(prefix, number) {
  return `${prefix}-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function createOrder(insertOrder, insertItem, { prefix, itemPrefix, index, userId }) {
  const day = index % 365;
  const orderDate = new Date(BASE_DATE + day * 24 * 60 * 60 * 1000 + (index % 24) * 60 * 60 * 1000)
    .toISOString();
  const hasNoItems = (prefix === '10000000' && index === 70)
    || (prefix === '20000000' && index === 10000);
  const itemCount = hasNoItems ? 0 : 1 + ((index + (prefix === '20000000' ? 2 : 0)) % 4);
  const items = [];
  let subtotalCents = 0;

  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    const product = PRODUCTS[(index + itemIndex) % PRODUCTS.length];
    const quantity = 1 + ((index + itemIndex) % 4);
    const unitPriceCents = 250 + ((index * 37 + itemIndex * 113) % 9750);
    const lineTotalCents = quantity * unitPriceCents;
    items.push({ product, quantity, unitPriceCents, lineTotalCents, itemIndex });
    subtotalCents += lineTotalCents;
  }

  const taxCents = Math.round(subtotalCents * 0.08);
  const shippingCents = index % 20 === 0 ? 0 : 500;
  const discountCents = (index % 10) * 100;
  const amount = (cents) => Number((cents / 100).toFixed(2));

  insertOrder.run(
    generatedId(prefix, index),
    userId,
    `SEED-${prefix}-${String(index).padStart(6, '0')}`,
    orderDate,
    STATUSES[index % STATUSES.length],
    amount(subtotalCents),
    amount(taxCents),
    amount(shippingCents),
    amount(discountCents),
    amount(subtotalCents + taxCents + shippingCents - discountCents),
    CURRENCIES[index % CURRENCIES.length]
  );

  for (const { product, quantity, unitPriceCents, lineTotalCents, itemIndex } of items) {
    insertItem.run(
      generatedId(itemPrefix, index * 4 + itemIndex + 1),
      generatedId(prefix, index),
      product.name,
      product.sku,
      quantity,
      amount(unitPriceCents),
      amount(lineTotalCents)
    );
  }
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

    const insertItem = db.prepare(`
      INSERT INTO order_items
        (id, order_id, product_name, sku, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        order_id = excluded.order_id,
        product_name = excluded.product_name,
        sku = excluded.sku,
        quantity = excluded.quantity,
        unit_price = excluded.unit_price,
        line_total = excluded.line_total
    `);

    db.prepare(`
      DELETE FROM order_items
      WHERE id IN (
        '30000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000002'
      )
    `).run();

    for (let index = 1; index <= 70; index += 1) {
      createOrder(insertOrder, insertItem, {
        prefix: '10000000', itemPrefix: '30000000', index, userId: USER_IDS.history
      });
    }

    for (let index = 1; index <= 10000; index += 1) {
      createOrder(insertOrder, insertItem, {
        prefix: '20000000', itemPrefix: '40000000', index, userId: USER_IDS.largeHistory
      });
    }
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