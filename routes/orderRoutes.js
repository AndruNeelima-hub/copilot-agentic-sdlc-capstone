const express = require('express');
const auth = require('../middleware/auth');
const rejectDuplicateParams = require('../middleware/rejectDuplicateParams');
const { createOrderHistoryController } = require('../controllers/orderHistoryController');
const { createOrderHistoryService } = require('../services/orderHistoryService');

function createOrderRoutes(db) {
  const router = express.Router();
  const getOrderHistory = createOrderHistoryController(createOrderHistoryService(db));

  router.get('/users/:userId/orders', auth, rejectDuplicateParams, getOrderHistory);
  return router;
}

module.exports = { createOrderRoutes };