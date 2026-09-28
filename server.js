require('dotenv').config();
const express = require('express');
const config = require('./config');
const { createDatabase } = require('./db/database');
const traceId = require('./middleware/traceId');
const audit = require('./middleware/audit');
const { errorHandler } = require('./middleware/errorHandler');
const { createOrderRoutes } = require('./routes/orderRoutes');

function createApp({ db = createDatabase(config.dbPath) } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(traceId);
  app.use(audit);
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1', createOrderRoutes(db));
  app.use(errorHandler);

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Order History API listening on port ${config.port}`);
  });
}

module.exports = { createApp };