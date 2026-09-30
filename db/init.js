const { dbPath } = require('../config');
const { createDatabase } = require('./database');

const db = createDatabase(dbPath);
db.close();

console.log(`Database initialized successfully at ${dbPath}.`);