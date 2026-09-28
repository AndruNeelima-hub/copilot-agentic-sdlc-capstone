require('dotenv').config();

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error(
    'Startup failed: JWT_SECRET is required. Configure it in the environment or .env file.'
  );
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || './db/order-history.sqlite',
  jwtSecret
};