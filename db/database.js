const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

function createDatabase(dbPath) {
  const db = new Database(dbPath);

  try {
    db.pragma('foreign_keys = ON');
    db.exec(schema);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

module.exports = { createDatabase };