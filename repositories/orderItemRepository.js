function findByOrderIds(db, orderIds) {
  if (orderIds.length === 0) {
    return new Map();
  }

  const placeholders = orderIds.map(() => '?').join(', ');
  const items = db.prepare(`
    SELECT id, order_id, product_name, sku, quantity, unit_price, line_total
    FROM order_items
    WHERE order_id IN (${placeholders})
    ORDER BY order_id, id
  `).all(...orderIds);
  const groupedItems = new Map(orderIds.map((orderId) => [orderId, []]));

  for (const item of items) {
    groupedItems.get(item.order_id).push(item);
  }

  return groupedItems;
}

module.exports = { findByOrderIds };