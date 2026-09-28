require('dotenv').config();
const jwt = require('jsonwebtoken');

const userId = process.argv[2];
const jwtSecret = process.env.JWT_SECRET;

if (!userId) {
  console.error('Usage: npm run token -- <userId>');
  process.exit(1);
}

if (!jwtSecret) {
  console.error('JWT_SECRET is required to generate a token.');
  process.exit(1);
}

process.stdout.write(`${jwt.sign({ sub: userId }, jwtSecret, {
  algorithm: 'HS256',
  expiresIn: '1h'
})}\n`);