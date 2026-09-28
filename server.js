require('dotenv').config();
const express = require('express');
const config = require('./config');

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Order History API listening on port ${config.port}`);
  });
}

module.exports = app;