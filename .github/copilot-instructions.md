# Copilot Instructions

- Project stack: Node.js + Express, SQLite via better-sqlite3, JWT via jsonwebtoken, schema validation with Zod, testing with Jest + Supertest.
- Follow the API contract from requirements.md and architecture.md: URL versioning, camelCase JSON, UTC dates, and `X-Trace-Id` on every response.
- Layering rules: `routes/controllers -> services -> repositories`; keep DB access inside repositories and business logic in services.
- Validate all input with Zod before database access; reject invalid UUIDs, pagination, dates, sort values, and duplicate single-value query params.
- Enforce authorization before querying orders: authenticate token, compare `sub` to `userId`, return `401` for missing/invalid token and `403` for mismatched user.
- Standard error envelope: `{ "error": { "code": "ERROR_CODE", "message": "Human readable message", "traceId": "trace-id" } }`.
- Security rules: never commit secrets or tokens; use environment variables only; never log bearer tokens, passwords, or full authorization headers.
- Never expose payment or internal DB fields; return only authorized order data.
- Audit requests with userId, path userId when present, timestamp, traceId, route, status, and duration; do not log sensitive data.
- Testing rules: write Jest + Supertest tests for both success and negative cases; cover auth, authorization, validation, pagination, filtering, and 404/400 flows.
- Run `npm test` before completion and fix any failing regression.
- Commit messages must follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, etc.
