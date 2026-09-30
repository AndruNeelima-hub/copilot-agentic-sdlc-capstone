const SORT_COLUMNS = Object.freeze({
  date: 'order_date',
  total: 'total'
});

const SORT_ORDERS = Object.freeze({
  asc: 'ASC',
  desc: 'DESC'
});

const ORDER_COLUMNS = `id, user_id, order_number, order_date, status,
  subtotal, tax, shipping, discount, total, currency`;

function buildFilters({ userId, status, startTimestampUtc, endTimestampUtc }) {
  const predicates = ['user_id = ?'];
  const parameters = [userId];

  if (status != null) {
    predicates.push('status = ?');
    parameters.push(status);
  }

  if (startTimestampUtc != null) {
    predicates.push('order_date >= ?');
    parameters.push(startTimestampUtc);
  }

  if (endTimestampUtc != null) {
    predicates.push('order_date <= ?');
    parameters.push(endTimestampUtc);
  }

  return { where: predicates.join(' AND '), parameters };
}

function countOrders(db, filters) {
  const { where, parameters } = buildFilters(filters);
  return db.prepare(`SELECT COUNT(*) AS count FROM orders WHERE ${where}`).get(...parameters).count;
}

function findOrders(db, options) {
  const { where, parameters } = buildFilters(options);
  const sortColumn = SORT_COLUMNS[options.sortBy || 'date'];
  const sortOrder = SORT_ORDERS[options.sortOrder || 'desc'];

  if (!sortColumn || !sortOrder) {
    throw new TypeError('Unsupported order sort field or direction.');
  }

  const limit = options.limit == null ? 20 : options.limit;
  const offset = options.offset == null ? 0 : options.offset;
  const query = `SELECT ${ORDER_COLUMNS} FROM orders WHERE ${where}
    ORDER BY ${sortColumn} ${sortOrder}, id ${sortOrder}
    LIMIT ? OFFSET ?`;

  return db.prepare(query).all(...parameters, limit, offset);
}

function findOrdersWithCount(db, options) {
  const readTransaction = db.transaction(() => ({
    totalRecords: countOrders(db, options),
    orders: findOrders(db, options)
  }));

  return readTransaction.deferred();
}

module.exports = { countOrders, findOrders, findOrdersWithCount };