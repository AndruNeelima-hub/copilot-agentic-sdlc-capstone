# Order History API Implementation Tasks

> **Stack decision:** Node.js, Express, and SQLite supersede the Java/Spring/PostgreSQL stack in `architecture.md`. SQLite-specific constraints and query behavior should be validated during implementation.

## 1. Project Setup

### P0 — SETUP-01: Initialize Node.js project
- **Involves:** Configure Node.js, Express, TypeScript or JavaScript, package scripts, linting, formatting, and environment configuration.
- **Blocked by:** None
- **Complexity:** Small

### P0 — SETUP-02: Configure application structure
- **Involves:** Create modules for routes, controllers, services, repositories, middleware, database, DTOs, and error handling.
- **Blocked by:** SETUP-01
- **Complexity:** Small

### P0 — SETUP-03: Configure test tooling
- **Involves:** Add unit and integration test runners, HTTP test utilities, test database configuration, and coverage reporting.
- **Blocked by:** SETUP-01
- **Complexity:** Small

### P1 — SETUP-04: Configure environment and startup validation
- **Involves:** Define port, SQLite path, shared authentication secret, logging settings, and validation for required configuration.
- **Blocked by:** SETUP-01
- **Complexity:** Small

## 2. Database Layer

### P0 — DB-01: Design SQLite schema and migrations
- **Involves:** Create `users`, `orders`, and `order_items` tables using UUIDs stored as text and UTC timestamps.
- **Blocked by:** SETUP-02
- **Complexity:** Medium

### P0 — DB-02: Add database constraints
- **Involves:** Implement:
  - Unique `order_number`
  - Allowed order-status `CHECK`
  - `quantity > 0`
  - Non-negative monetary fields
  - Foreign keys
  - Required fields
- **Blocked by:** DB-01
- **Complexity:** Medium

### P0 — DB-03: Add indexes
- **Involves:** Add indexes for user/date, user/status/date, user/total, and order-item lookup queries.
- **Blocked by:** DB-01
- **Complexity:** Small

### P0 — DB-04: Implement database initialization
- **Involves:** Enable SQLite foreign keys, apply migrations, configure connection handling, and support isolated test databases.
- **Blocked by:** DB-01
- **Complexity:** Medium

### P1 — DB-05: Add development and test seed data
- **Involves:** Create active, disabled, deleted, empty-history, multi-status, and large-history test users.
- **Blocked by:** DB-04
- **Complexity:** Small

## 3. Cross-Cutting Middleware

### P0 — MW-01: Implement trace ID middleware
- **Involves:** Create or propagate `X-Trace-Id` and include it on every successful and error response.
- **Blocked by:** SETUP-02
- **Complexity:** Small

### P0 — MW-02: Implement authentication middleware
- **Involves:** Validate bearer tokens using the shared secret and standard `sub` and `exp` claims. Return `401` with `UNAUTHORIZED`.
- **Blocked by:** SETUP-04
- **Complexity:** Medium

### P0 — MW-03: Implement centralized error handling
- **Involves:** Map failures to the required error envelope and stable codes:
  - `INVALID_UUID`
  - `INVALID_STATUS`
  - `INVALID_DATE`
  - `INVALID_PAGINATION`
  - `INVALID_SORT`
  - `UNAUTHORIZED`
  - `FORBIDDEN`
  - `USER_NOT_FOUND`
  - `INTERNAL_ERROR`
- **Blocked by:** MW-01, SETUP-02
- **Complexity:** Medium

### P0 — MW-04: Implement audit logging middleware
- **Involves:** Record every request, including unauthenticated requests, with `userId: null` when necessary, timestamp, trace ID, route, duration, and outcome.
- **Blocked by:** MW-01, MW-02, MW-03
- **Complexity:** Medium

### P0 — MW-05: Implement duplicate query-parameter validation
- **Involves:** Reject repeated single-valued parameters such as `status=A&status=B` with `400 Bad Request`.
- **Blocked by:** SETUP-02
- **Complexity:** Small

## 4. Repository and Data Access

### P0 — REPO-01: Implement user repository
- **Involves:** Find users by UUID and distinguish active, disabled, and soft-deleted users.
- **Blocked by:** DB-04
- **Complexity:** Small

### P0 — REPO-02: Implement filtered order count query
- **Involves:** Count orders by user, status, and UTC date range.
- **Blocked by:** DB-03, REPO-01
- **Complexity:** Medium

### P0 — REPO-03: Implement paginated order query
- **Involves:** Support page, page size, status, UTC date filters, and whitelisted date/total sorting with deterministic ID tie-breaking.
- **Blocked by:** DB-03
- **Complexity:** Medium

### P0 — REPO-04: Implement batched item loading
- **Involves:** Load all items for returned orders using one `IN (...)` query, then group them by order ID.
- **Blocked by:** DB-04
- **Complexity:** Medium

### P1 — REPO-05: Add repository transaction behavior
- **Involves:** Define how count and page queries are executed consistently and configure SQLite transaction handling.
- **Blocked by:** REPO-02, REPO-03
- **Complexity:** Medium

## 5. Business Logic

### P0 — SVC-01: Implement request validation
- **Involves:** Validate UUIDs, pagination bounds, supported statuses, ISO date values, date ordering, sort fields, sort order, and duplicate parameters.
- **Blocked by:** MW-03, MW-05
- **Complexity:** Medium

### P0 — SVC-02: Implement authorization rules
- **Involves:** Compare authenticated token subject with the path `userId`; return generic `403 Forbidden` without revealing target-user existence.
- **Blocked by:** MW-02, SVC-01
- **Complexity:** Small

### P0 — SVC-03: Implement user validation
- **Involves:** Return `USER_NOT_FOUND` for nonexistent, disabled, or soft-deleted users after authorization succeeds.
- **Blocked by:** REPO-01, SVC-02
- **Complexity:** Small

### P0 — SVC-04: Implement order-history service
- **Involves:** Coordinate validation, authorization, user lookup, count query, page query, batched item loading, and DTO mapping.
- **Blocked by:** REPO-02, REPO-03, REPO-04, SVC-03
- **Complexity:** Large

### P0 — SVC-05: Implement pagination metadata
- **Involves:** Calculate:
  - `totalRecords`
  - `totalPages`
  - `currentPage`
  - `hasNextPage`
  
  Ensure `totalPages = 0` for zero records and out-of-range pages return `200` with empty data.
- **Blocked by:** REPO-02, REPO-03, SVC-04
- **Complexity:** Medium

### P0 — SVC-06: Implement UTC date semantics
- **Involves:** Treat `startDate` as inclusive from UTC midnight and `endDate` as inclusive through the full UTC day.
- **Blocked by:** SVC-01, REPO-02, REPO-03
- **Complexity:** Medium

## 6. API Layer

### P0 — API-01: Implement orders route
- **Involves:** Add `GET /api/v1/users/{userId}/orders` and connect middleware, controller, and service layers.
- **Blocked by:** MW-01, MW-02, MW-03, MW-05, SVC-04
- **Complexity:** Medium

### P0 — API-02: Implement success response envelope
- **Involves:** Return `data` and pagination metadata using camelCase fields and the required order/item fields.
- **Blocked by:** SVC-05, API-01
- **Complexity:** Small

### P0 — API-03: Implement error response behavior
- **Involves:** Verify HTTP mappings for validation, authentication, authorization, user-not-found, and unexpected errors.
- **Blocked by:** MW-03, API-01
- **Complexity:** Small

### P1 — API-04: Add OpenAPI documentation
- **Involves:** Document authentication, endpoint parameters, defaults, validation rules, response schemas, error codes, and `X-Trace-Id`.
- **Blocked by:** API-01, API-02, API-03
- **Complexity:** Medium

## 7. Testing

### P0 — TEST-01: Test database constraints
- **Involves:** Verify foreign keys, unique order numbers, valid statuses, positive quantities, and non-negative monetary values.
- **Blocked by:** DB-02, DB-04
- **Complexity:** Medium

### P0 — TEST-02: Test authentication and authorization
- **Involves:** Cover missing/invalid tokens, expired tokens, own-user access, cross-user access, generic `403` messages, and inaccessible users.
- **Blocked by:** MW-02, SVC-02, SVC-03
- **Complexity:** Medium

### P0 — TEST-03: Test query validation
- **Involves:** Cover invalid UUIDs, statuses, dates, pagination, sorting, date ranges, and duplicate parameters.
- **Blocked by:** SVC-01
- **Complexity:** Medium

### P0 — TEST-04: Test repository queries
- **Involves:** Verify filtering, UTC boundaries, sorting, pagination, count behavior, and batched item loading.
- **Blocked by:** REPO-02, REPO-03, REPO-04, SVC-06
- **Complexity:** Large

### P0 — TEST-05: Test pagination edge cases
- **Involves:** Verify:
  - Empty history
  - `totalPages = 0`
  - First, middle, and last pages
  - Page beyond `totalPages`
  - Page sizes 1 and 100
  - Invalid page sizes
- **Blocked by:** SVC-05, API-02
- **Complexity:** Medium

### P0 — TEST-06: Test response and error envelopes
- **Involves:** Verify camelCase fields, required order/item fields, stable error codes, generic messages, and trace headers.
- **Blocked by:** API-02, API-03
- **Complexity:** Medium

### P0 — TEST-07: Test audit logging
- **Involves:** Verify authenticated and unauthenticated requests are logged, including `userId: null`, status, timestamp, and trace ID.
- **Blocked by:** MW-04, API-01
- **Complexity:** Medium

### P1 — TEST-08: Add large-history performance test
- **Involves:** Test approximately 10,000 orders, page size 100, filtered queries, and response-time targets.
- **Blocked by:** TEST-04, TEST-05
- **Complexity:** Large

## 8. Documentation and Delivery

### P1 — DOC-01: Document local setup
- **Involves:** Describe prerequisites, environment variables, database initialization, seed data, test commands, and startup commands.
- **Blocked by:** SETUP-04, DB-05
- **Complexity:** Small

### P1 — DOC-02: Document implementation decisions
- **Involves:** Update architecture documentation to record the Node.js/Express/SQLite stack, SQLite constraints, UTC behavior, batched loading, error codes, and audit behavior.
- **Blocked by:** API-04, TEST-06
- **Complexity:** Medium

### P1 — DOC-03: Add API usage examples
- **Involves:** Provide authenticated requests, filtering, sorting, pagination, empty results, and representative error responses.
- **Blocked by:** API-04
- **Complexity:** Small

### P1 — DOC-04: Perform security and privacy review
- **Involves:** Human review of authentication, authorization, order-data exposure, audit logs, token handling, and generic forbidden responses.
- **Blocked by:** TEST-02, TEST-07
- **Complexity:** Medium

### P1 — DOC-05: Final acceptance review
- **Involves:** Map implementation and tests to all requirements and acceptance criteria in `requirements.md`.
- **Blocked by:** TEST-01 through TEST-08, DOC-01 through DOC-04
- **Complexity:** Medium

## Suggested Critical Path

```text
SETUP-01
  -> SETUP-02
  -> DB-01
  -> DB-02 / DB-03 / DB-04
  -> REPO-01 / REPO-02 / REPO-03 / REPO-04
  -> SVC-01 / SVC-02 / SVC-03 / SVC-04 / SVC-05
  -> API-01 / API-02 / API-03
  -> TEST-04 / TEST-05 / TEST-06
  -> DOC-04
  -> DOC-05
```

Caching, rate limiting, enterprise JWT features, disaster recovery, and production query-plan benchmarking remain outside the v1 implementation scope.