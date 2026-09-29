const { createDatabase } = require('../../db/database');
const { seedDatabase } = require('../../db/seed');

function createTestDatabase({ dbPath = ':memory:', seed = true } = {}) {
  const db = createDatabase(dbPath);
  if (seed) seedDatabase(db);
  return db;
}

module.exports = { createTestDatabase };