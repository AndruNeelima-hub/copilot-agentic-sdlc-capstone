const { createAppError } = require('../middleware/errorHandler');
const userRepository = require('../repositories/userRepository');
const orderRepository = require('../repositories/orderRepository');
const orderItemRepository = require('../repositories/orderItemRepository');

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toItemDto(item) {
  return {
    itemId: item.id,
    productName: item.product_name,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: roundMoney(item.unit_price),
    lineTotal: roundMoney(item.line_total)
  };
}

function toOrderDto(order, items) {
  return {
    orderId: order.id,
    orderNumber: order.order_number,
    date: order.order_date,
    status: order.status,
    items: (items.get(order.id) || []).map(toItemDto),
    subtotal: roundMoney(order.subtotal),
    tax: roundMoney(order.tax),
    shipping: roundMoney(order.shipping),
    discount: roundMoney(order.discount),
    total: roundMoney(order.total),
    currency: order.currency
  };
}

function serializeOrderRows(orders, groupedItems) {
  return orders.map((order) => toOrderDto(order, groupedItems));
}

function calculatePaginationMetadata(totalRecords, query) {
  const totalPages = totalRecords === 0
    ? 0
    : Math.ceil(totalRecords / query.pageSize);

  return {
    totalRecords,
    totalPages,
    currentPage: query.page,
    hasNextPage: query.page < totalPages
  };
}

function createOrderHistoryService(db) {
  return {
    getOrderHistory(userId, authenticatedUserId, query) {
      if (authenticatedUserId !== userId) {
        throw createAppError(403, 'FORBIDDEN', 'Access denied');
      }

      const user = userRepository.findById(db, userId);
      if (!userRepository.isAvailable(user)) {
        throw createAppError(404, 'USER_NOT_FOUND', 'User not found');
      }

      const result = orderRepository.findOrdersWithCount(db, {
        userId,
        status: query.status,
        startTimestampUtc: query.startTimestampUtc,
        endTimestampUtc: query.endTimestampUtc,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize
      });
      const groupedItems = orderItemRepository.findByOrderIds(
        db,
        result.orders.map((order) => order.id)
      );

      return {
        data: serializeOrderRows(result.orders, groupedItems),
        metadata: calculatePaginationMetadata(result.totalRecords, query)
      };
    }
  };
}

module.exports = { createOrderHistoryService };