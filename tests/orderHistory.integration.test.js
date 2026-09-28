process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createDatabase } = require('../db/database');
const { createApp } = require('../server');

const USER_ID = '00000000-0000-4000-8000-000000000001';
const EMPTY_USER_ID = '00000000-0000-4000-8000-000000000002';
const DISABLED_USER_ID = '00000000-0000-4000-8000-000000000003';
const DELETED_USER_ID = '00000000-0000-4000-8000-000000000004';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000005';

describe('order history API', () => {
  let db;
  let app;
  let token;

  function makeToken(userId) {
    return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }

  async function send(requestBuilder) {
    const response = await requestBuilder;
    expect(response.headers['x-trace-id']).toBeTruthy();
    return response;
  }

  function authorizedGet(userId = USER_ID, bearerToken = token) {
    const call = request(app).get(`/api/v1/users/${userId}/orders`);
    return bearerToken ? call.set('Authorization', `Bearer ${bearerToken}`) : call;
  }

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp({ db });

    const insertUser = db.prepare(
      'INSERT INTO users (id, status, disabled_at, deleted_at) VALUES (?, ?, ?, ?)'
    );
    insertUser.run(USER_ID, 'active', null, null);
    insertUser.run(EMPTY_USER_ID, 'active', null, null);
    insertUser.run(DISABLED_USER_ID, 'disabled', '2026-01-01T00:00:00.000Z', null);
    insertUser.run(DELETED_USER_ID, 'active', null, '2026-01-01T00:00:00.000Z');
    insertUser.run(OTHER_USER_ID, 'active', null, null);

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, user_id, order_number, order_date, status, subtotal, tax,
        shipping, discount, total, currency
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 'USD')
    `);
    [
      ['00000000-0000-4000-8000-000000000101', '2026-09-25T10:00:00.000Z', 'Pending', 30],
      ['00000000-0000-4000-8000-000000000102', '2026-09-26T10:00:00.000Z', 'Processing', 10],
      ['00000000-0000-4000-8000-000000000103', '2026-09-27T10:00:00.000Z', 'Delivered', 20],
      ['00000000-0000-4000-8000-000000000104', '2026-09-28T10:00:00.000Z', 'Pending', 60],
      ['00000000-0000-4000-8000-000000000105', '2026-09-28T18:00:00.000Z', 'Shipped', 40],
      ['00000000-0000-4000-8000-000000000106', '2026-09-29T10:00:00.000Z', 'Delivered', 50]
    ].forEach(([id, date, status, total]) => {
      insertOrder.run(id, USER_ID, `ORD-${id.slice(-3)}`, date, status, total, total);
    });

    db.prepare(`
      INSERT INTO order_items (id, order_id, product_name, sku, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000101',
      'Sample Item',
      'SKU-1',
      2,
      15,
      30
    );
    token = makeToken(USER_ID);
  });

  afterEach(() => {
    db.close();
  });

  test('returns order and item DTOs with metadata', async () => {
    const response = await send(authorizedGet());

    expect(response.status).toBe(200);
    expect(response.body.metadata).toEqual({
      totalRecords: 6,
      totalPages: 1,
      currentPage: 1,
      hasNextPage: false
    });
    const order = response.body.data.find((item) => item.orderId.endsWith('101'));
    expect(order).toMatchObject({
      orderNumber: 'ORD-101',
      date: '2026-09-25T10:00:00.000Z',
      status: 'Pending',
      subtotal: 30,
      tax: 0,
      shipping: 0,
      discount: 0,
      total: 30,
      currency: 'USD',
      items: [{
        itemId: '00000000-0000-4000-8000-000000000201',
        productName: 'Sample Item',
        sku: 'SKU-1',
        quantity: 2,
        unitPrice: 15,
        lineTotal: 30
      }]
    });
    expect(response.body.data.find((item) => item.orderId.endsWith('102')).items).toEqual([]);
    expect(response.body.data[0]).not.toHaveProperty('user_id');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  test('returns empty history with zero total pages', async () => {
    const response = await send(authorizedGet(EMPTY_USER_ID, makeToken(EMPTY_USER_ID)));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      metadata: { totalRecords: 0, totalPages: 0, currentPage: 1, hasNextPage: false }
    });
  });

  test.each([
    ['disabled', DISABLED_USER_ID],
    ['soft-deleted', DELETED_USER_ID]
  ])('returns 404 for a %s user authenticated as that user', async (_label, userId) => {
    const response = await send(authorizedGet(userId, makeToken(userId)));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('USER_NOT_FOUND');
  });

  test('returns 401 without or with an invalid token', async () => {
    const missing = await send(authorizedGet(USER_ID, null));
    const invalid = await send(authorizedGet(USER_ID, 'not-a-jwt'));
    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(missing.body.error.code).toBe('UNAUTHORIZED');
    expect(invalid.body.error.code).toBe('UNAUTHORIZED');
  });

  test('returns a generic forbidden response for another user ID', async () => {
    const response = await send(authorizedGet(OTHER_USER_ID));
    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: 'FORBIDDEN', message: 'Access denied' });
  });

  test.each([
    [1, 2, true],
    [2, 2, true],
    [3, 2, false]
  ])('serves page %i with accurate metadata', async (page, expectedCount, hasNextPage) => {
    const response = await send(authorizedGet().query({ page, pageSize: 2 }));
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(expectedCount);
    expect(response.body.metadata).toMatchObject({
      totalRecords: 6,
      totalPages: 3,
      currentPage: page,
      hasNextPage
    });
  });

  test('returns empty data for a page beyond the last page', async () => {
    const response = await send(authorizedGet().query({ page: 4, pageSize: 2 }));
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.metadata).toEqual({
      totalRecords: 6,
      totalPages: 3,
      currentPage: 4,
      hasNextPage: false
    });
  });

  test.each([[1, 1], [100, 6]])('accepts pageSize=%i', async (pageSize, expectedCount) => {
    const response = await send(authorizedGet().query({ pageSize }));
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(expectedCount);
  });

  test.each([
    [{ pageSize: 101 }, 'INVALID_PAGINATION'],
    [{ page: 0 }, 'INVALID_PAGINATION'],
    [{ status: 'Unknown' }, 'INVALID_STATUS'],
    [{ startDate: '2026-02-30' }, 'INVALID_DATE'],
    [{ sortBy: 'price' }, 'INVALID_SORT'],
    [{ status: 'Pending', status2: 'ignored' }, null]
  ])('validates query %j', async (query, code) => {
    const response = await send(authorizedGet().query(query));
    if (code) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(code);
    } else {
      expect(response.status).toBe(200);
    }
  });

  test('filters by status and inclusive UTC date range', async () => {
    const byStatus = await send(authorizedGet().query({ status: 'Delivered' }));
    expect(byStatus.body.data).toHaveLength(2);
    expect(byStatus.body.data.every((order) => order.status === 'Delivered')).toBe(true);

    const byDate = await send(authorizedGet().query({
      startDate: '2026-09-27',
      endDate: '2026-09-28'
    }));
    expect(byDate.body.data).toHaveLength(3);
    expect(byDate.body.data.every((order) => order.date >= '2026-09-27T00:00:00.000Z'))
      .toBe(true);
    expect(byDate.body.data.every((order) => order.date <= '2026-09-28T23:59:59.999Z'))
      .toBe(true);
  });

  test('rejects startDate after endDate and duplicate single-valued params', async () => {
    const invalidRange = await send(authorizedGet().query({
      startDate: '2026-09-29',
      endDate: '2026-09-28'
    }));
    const duplicate = await send(request(app)
      .get(`/api/v1/users/${USER_ID}/orders?status=Pending&status=Shipped`)
      .set('Authorization', `Bearer ${token}`));

    expect(invalidRange.status).toBe(400);
    expect(invalidRange.body.error.code).toBe('INVALID_DATE');
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.code).toBe('INVALID_STATUS');
  });

  test('sorts by total in the requested direction', async () => {
    const ascending = await send(authorizedGet().query({ sortBy: 'total', sortOrder: 'asc' }));
    const descending = await send(authorizedGet().query({ sortBy: 'total', sortOrder: 'desc' }));
    expect(ascending.body.data.map((order) => order.total)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(descending.body.data.map((order) => order.total)).toEqual([60, 50, 40, 30, 20, 10]);
  });

  test('keeps health public and includes trace IDs on health and error responses', async () => {
    const health = await send(request(app).get('/health'));
    const invalidUser = await send(authorizedGet('not-a-uuid'));
    expect(health.status).toBe(200);
    expect(invalidUser.status).toBe(400);
    expect(invalidUser.body.error.code).toBe('INVALID_UUID');
  });

  test('serves the public OpenAPI document with the order history contract', async () => {
    const response = await send(request(app).get('/api-docs.json'));

    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body.paths['/api/v1/users/{userId}/orders'].get).toBeDefined();
    expect(response.body.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer'
    });
    expect(response.body.paths['/api/v1/users/{userId}/orders'].get.responses)
      .toEqual(expect.objectContaining({
        '200': expect.any(Object),
        '400': expect.any(Object),
        '401': expect.any(Object),
        '403': expect.any(Object),
        '404': expect.any(Object),
        '500': expect.any(Object)
      }));
  });

  test('emits audit records for unauthenticated requests without console output in Jest', async () => {
    const auditRecord = new Promise((resolve) => app.once('audit', resolve));
    const response = await send(authorizedGet(USER_ID, null));
    const record = await auditRecord;

    expect(response.status).toBe(401);
    expect(record).toMatchObject({
      method: 'GET',
      route: '/users/:userId/orders',
      statusCode: 401,
      userId: null
    });
    expect(record.traceId).toBe(response.headers['x-trace-id']);
    expect(record.timestamp).toBeTruthy();
    expect(record.durationMs).toEqual(expect.any(Number));
  });
});