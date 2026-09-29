const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../db/database');
const userRepository = require('../repositories/userRepository');
const orderRepository = require('../repositories/orderRepository');
const orderItemRepository = require('../repositories/orderItemRepository');

describe('repositories', () => {
  let directory;
  let db;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'order-history-repositories-'));
    db = createDatabase(path.join(directory, 'test.sqlite'));
    db.prepare('INSERT INTO users (id, status) VALUES (?, ?)').run('user-1', 'active');
    db.prepare('INSERT INTO users (id, status) VALUES (?, ?)').run('user-2', 'active');

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, user_id, order_number, order_date, status, subtotal, tax,
        shipping, discount, total, currency
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, ?, 'USD')
    `);
    insertOrder.run('order-b', 'user-1', 'number-b', '2026-06-01T23:59:59.999Z', 'Pending', 20);
    insertOrder.run('order-a', 'user-1', 'number-a', '2026-06-01T23:59:59.999Z', 'Pending', 20);
    insertOrder.run('order-c', 'user-1', 'number-c', '2026-06-02T00:00:00.000Z', 'Shipped', 30);
    insertOrder.run('order-before', 'user-1', 'number-before', '2026-05-31T23:59:59.999Z', 'Pending', 10);
    insertOrder.run('other-user-order', 'user-2', 'number-other', '2026-06-01T12:00:00.000Z', 'Pending', 10);

    db.prepare(`
      INSERT INTO order_items (id, order_id, product_name, sku, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('item-1', 'order-a', 'Widget', 'W-1', 2, 5, 10);
    db.prepare(`
      INSERT INTO order_items (id, order_id, product_name, sku, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('item-2', 'order-a', 'Cable', 'C-1', 1, 3, 3);
    db.prepare(`
      INSERT INTO order_items (id, order_id, product_name, sku, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('item-3', 'order-c', 'Case', 'K-1', 1, 8, 8);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('finds users and excludes disabled or soft-deleted users', () => {
    db.prepare('INSERT INTO users (id, status, disabled_at) VALUES (?, ?, ?)')
      .run('user-disabled', 'disabled', '2026-01-01T00:00:00.000Z');
    db.prepare('INSERT INTO users (id, status, deleted_at) VALUES (?, ?, ?)')
      .run('user-deleted', 'active', '2026-01-01T00:00:00.000Z');

    expect(userRepository.findById(db, 'missing')).toBeNull();
    expect(userRepository.isAvailable(userRepository.findById(db, 'user-1'))).toBe(true);
    expect(userRepository.isAvailable(userRepository.findById(db, 'user-disabled'))).toBe(false);
    expect(userRepository.isAvailable(userRepository.findById(db, 'user-deleted'))).toBe(false);
  });

  test('requires currency to be exactly three uppercase letters', () => {
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, user_id, order_number, order_date, status, subtotal, tax,
        shipping, discount, total, currency
      ) VALUES (?, 'user-1', ?, '2026-06-01T12:00:00.000Z', 'Pending', 0, 0, 0, 0, 0, ?)
    `);

    expect(() => insertOrder.run('currency-short', 'currency-short', 'US')).toThrow();
    expect(() => insertOrder.run('currency-lower', 'currency-lower', 'usd')).toThrow();
    expect(() => insertOrder.run('currency-long', 'currency-long', 'USDX')).toThrow();
    expect(insertOrder.run('currency-valid', 'currency-valid', 'USD').changes).toBe(1);
  });

  test('filters inclusively by UTC bounds and status, then sorts and paginates deterministically', () => {
    const filters = {
      userId: 'user-1',
      status: 'Pending',
      startTimestampUtc: '2026-06-01T00:00:00.000Z',
      endTimestampUtc: '2026-06-01T23:59:59.999Z'
    };

    expect(orderRepository.countOrders(db, filters)).toBe(2);
    expect(orderRepository.findOrders(db, {
      ...filters,
      sortBy: 'date',
      sortOrder: 'asc',
      limit: 1,
      offset: 0
    }).map((order) => order.id)).toEqual(['order-a']);
    expect(orderRepository.findOrders(db, {
      ...filters,
      sortBy: 'total',
      sortOrder: 'desc',
      limit: 1,
      offset: 1
    }).map((order) => order.id)).toEqual(['order-a']);
    expect(() => orderRepository.findOrders(db, { ...filters, sortBy: 'order_date; DROP TABLE orders' }))
      .toThrow(TypeError);
  });

  test('loads items in batches, groups by order, and skips empty input', () => {
    const grouped = orderItemRepository.findByOrderIds(db, ['order-a', 'order-c', 'order-b']);

    expect(grouped.get('order-a').map((item) => item.id)).toEqual(['item-1', 'item-2']);
    expect(grouped.get('order-c').map((item) => item.id)).toEqual(['item-3']);
    expect(grouped.get('order-b')).toEqual([]);
    expect(orderItemRepository.findByOrderIds(db, [])).toEqual(new Map());
  });

  test('returns count and page from the same read transaction', () => {
    const result = orderRepository.findOrdersWithCount(db, {
      userId: 'user-1',
      status: null,
      startTimestampUtc: null,
      endTimestampUtc: null,
      sortBy: 'date',
      sortOrder: 'desc',
      limit: 2,
      offset: 1
    });

    expect(result.totalRecords).toBe(4);
    expect(result.orders).toHaveLength(2);
    expect(result.orders.every((order) => order.user_id === 'user-1')).toBe(true);
  });
});