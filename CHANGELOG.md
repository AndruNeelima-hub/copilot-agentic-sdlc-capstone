# Changelog

## 1.0.0

### Added

- Introduced the Order History API endpoint, `GET /api/v1/users/{userId}/orders`, with pagination, status and date filtering, sorting, order items, and pagination metadata.
- Added SQLite schema, repositories, initialization, and realistic seed data, including a 10,000-order user for large-history checks.
- Added JWT token generation, interactive Swagger UI, and OpenAPI documentation.
- Added integration, repository, and seed tests for API behavior, acceptance criteria, and performance.
- Added setup, requirements, architecture, design review, implementation plan, and code review documentation.

### Security

- Require a valid JWT and restrict order-history access to the token subject's own user ID; reject malformed UUID subjects.
- Return `404` for missing, disabled, or soft-deleted users without exposing their order history.
- Add trace IDs, audit logging of authenticated and requested user IDs and request outcomes, and the `X-Content-Type-Options: nosniff` response header.
- Exclude Swagger assets from audit records and keep payment method and card information out of the API response.

### Changed

- Validate pagination, status, dates, sorting, and duplicate query parameters; reject page values above a safe bound and preserve the `pageSize` maximum of 100.
- Constrain stored currency codes to exactly three uppercase letters.
- Expand negative-path and status-filter coverage, and add a performance assertion for a `pageSize=100` request against 10,000 orders.
- Update compatible Jest and Supertest dependencies and their lockfile; retain dotenv v17 rather than taking a major-version upgrade.