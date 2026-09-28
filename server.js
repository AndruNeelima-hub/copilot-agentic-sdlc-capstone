require('dotenv').config();
const express = require('express');
const config = require('./config');
const traceId = require('./middleware/traceId');
const audit = require('./middleware/audit');
const rejectDuplicateParams = require('./middleware/rejectDuplicateParams');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(traceId);
app.use(audit);
app.use(express.json());
app.use(rejectDuplicateParams);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Order History API listening on port ${config.port}`);
  });
}

module.exports = app;