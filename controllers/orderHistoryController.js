const { validateOrderHistoryQuery } = require('../dto/orderHistoryQuery');

function createOrderHistoryController(orderHistoryService) {
  return function getOrderHistory(req, res, next) {
    try {
      const query = validateOrderHistoryQuery(req.params.userId, req.query);
      const result = orderHistoryService.getOrderHistory(
        query.userId,
        req.userId,
        query
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { createOrderHistoryController };