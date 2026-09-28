const { AppError } = require('../middleware/errorHandler');
const userRepository = require('../repositories/userRepository');
const orderRepository = require('../repositories/orderRepository');
const orderItemRepository = require('../repositories/orderItemRepository');

function toItemDto(item) {
  return {
    itemId: item.id,
    productName: item.product_name,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    lineTotal: item.line_total
  };
}

function toOrderDto(order, items) {
  return {
    orderId: order.id,
    orderNumber: order.order_number,
    date: order.order_date,
    status: order.status,
    items: (items.get(order.id) || []).map(toItemDto),
    subtotal: order.subtotal,
    tax: order.tax,
    shipping: order.shipping,
    discount: order.discount,
    total: order.total,
    currency: order.currency
  };
}

function createOrderHistoryService(db) {
  return {
    getOrderHistory(userId, authenticatedUserId, query) {
      if (authenticatedUserId !== userId) {
        throw new AppError(403, 'FORBIDDEN', 'Access denied');
      }

      const user = userRepository.findById(db, userId);
      if (!userRepository.isAvailable(user)) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
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
      const totalPages = result.totalRecords === 0
        ? 0
        : Math.ceil(result.totalRecords / query.pageSize);

      return {
        data: result.orders.map((order) => toOrderDto(order, groupedItems)),
        metadata: {
          totalRecords: result.totalRecords,
          totalPages,
          currentPage: query.page,
          hasNextPage: query.page < totalPages
        }
      };
    }
  };
}

module.exports = { createOrderHistoryService };