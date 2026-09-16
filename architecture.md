# Order History API Architecture

## 1. Recommended Tech Stack

- **Language and framework:** Node.js (LTS) with Express
- **Database:** SQLite (single file, e.g. `orders.db`)
- **Query layer:** better-sqlite3
- **Authentication:** JWT bearer tokens (jsonwebtoken package)
- **Validation:** Zod
- **Caching:** in-memory (node-cache), optional, 30-60 second TTL
- **Documentation:** OpenAPI 3 via swagger-jsdoc + swagger-ui-express
- **Testing:** Jest + Supertest
- **Deployment:** single containerized Node process (local Docker for this capstone)

SQLite is appropriate for this capstone's scale (local dev, single-file DB, no separate server needed) while still supporting the filtering, sorting, and pagination required.

## 2. Component Breakdown

```text
Client
  |
  v
Express App
  |
  +-- Trace and Request Middleware
  +-- Authentication Middleware (JWT)
  +-- Order History Route/Controller
  +-- Query Validation (Zod schema)
  +-- Authorization Check
  +-- Order History Service
  +-- User Repository (SQLite)
  +-- Order Repository (SQLite)
  +-- Response Mapper
  +-- Audit Logger
  |
  +-- SQLite (orders.db)
  +-- In-memory cache, optional
```

### 2.1 Trace and Request Middleware
- Generate or propagate `X-Trace-Id` header.
- Include `X-Trace-Id` in every response.
- Log request duration and response status.
- Convert unexpected errors into the standard error response envelope.

### 2.2 Authentication Middleware
- Validate the JWT bearer token.
- Extract the authenticated user UUID from the token payload.
- Return `401 Unauthorized` for missing or invalid tokens.
- Do not trust the path `userId` as the authenticated identity.

### 2.3 Order History Route/Controller
Expose:
```text
GET /api/v1/users/:userId/orders
```
Parses path and query parameters, applies defaults, delegates to the service layer.

Defaults:
- `page=1`
- `pageSize=20`
- `sortBy=date`
- `sortOrder=desc`

### 2.4 Query Validation (Zod)
Validate before querying the database:
- `userId` is a valid UUID
- `page >= 1`
- `1 <= pageSize <= 100`
- `status` is a supported single value
- dates use ISO format; `startDate <= endDate`
- `sortBy` is `date` or `total`
- `sortOrder` is `asc` or `desc`

Invalid values return `400 Bad Request` with the standard error format.

### 2.5 Authorization and User Validation
1. Authenticate the request (JWT).
2. Compare token user ID with path `userId`.
3. Return `403 Forbidden` if they differ.
4. Verify the requested user exists and is active in SQLite.
5. Return `404 Not Found` if the user does not exist, is disabled, or is soft-deleted.
6. Query only that user's orders.

### 2.6 Order History Service
Coordinates:
- User validation
- Filter construction
- Sorting
- Pagination
- Total count calculation
- Pagination metadata generation
- DTO mapping
- Audit logging

A request for a page beyond `totalPages` returns `200 OK` with an empty `data` array.

### 2.7 Repository Layer (better-sqlite3)
Use parameterized queries; whitelist sortable columns — never interpolate user-provided sort values directly into SQL.

Representative query:
```sql
SELECT *
FROM orders
WHERE user_id = ?
  AND (? IS NULL OR status = ?)
  AND (? IS NULL OR order_date >= ?)
  AND (? IS NULL OR order_date <= ?)
ORDER BY order_date DESC, id DESC
LIMIT ? OFFSET ?;
```

The count query applies the same filters.

### 2.8 Audit Logging
Record: authenticated user ID, requested path user ID, timestamp, trace ID, outcome/status code, request duration — as structured JSON logs (or a dedicated `audit_log` table).

## 3. Data Model

### 3.1 `users`
| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `status` | TEXT | active/disabled |
| `disabled_at` | TEXT (ISO datetime) | Nullable |
| `deleted_at` | TEXT (ISO datetime) | Nullable |

### 3.2 `orders`
| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `user_id` | TEXT (UUID) | Required, FK to `users.id` |
| `order_number` | TEXT | Required |
| `order_date` | TEXT (ISO datetime) | Required |
| `status` | TEXT | Required |
| `subtotal` | REAL | Required |
| `tax` | REAL | Required |
| `shipping` | REAL | Required |
| `discount` | REAL | Required |
| `total` | REAL | Required |
| `currency` | TEXT(3) | Required ISO-4217 code |

### 3.3 `order_items`
| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `order_id` | TEXT (UUID) | Required, FK to `orders.id` |
| `product_name` | TEXT | Required |
| `sku` | TEXT | Required |
| `quantity` | INTEGER | Required |
| `unit_price` | REAL | Required |
| `line_total` | REAL | Required |

Recommended indexes:
```text
orders(user_id, order_date DESC)
orders(user_id, status, order_date DESC)
orders(user_id, total)
order_items(order_id)
```

## 4. Data Flow
1. Client sends request with bearer token and optional query params.
2. Trace middleware creates/propagates `X-Trace-Id`.
3. Auth middleware validates JWT, extracts authenticated user UUID.
4. Controller parses request.
5. Zod validation rejects malformed params with `400 Bad Request`.
6. Authorization compares authenticated UUID with `:userId`; mismatch → `403 Forbidden`.
7. User repository verifies user exists/active; invalid → `404 Not Found`.
8. Optional in-memory cache lookup on full query key.
9. On cache miss, service executes filtered count + page queries via better-sqlite3.
10. Orders and items mapped to response DTOs.
11. Service calculates `totalPages`, `currentPage`, `hasNextPage`.
12. Audit event recorded.
13. Response returned with `X-Trace-Id` header.

## 5. Pagination and Sorting
Offset pagination (page/pageSize) since the API contract requires page numbers and total counts. Deterministic tie-breakers: `ORDER BY order_date DESC, id DESC` (or `total DESC, id DESC`). Max page size 100; SQLite handles up to ~10,000 rows per user easily at this scale.

## 6. Caching
Optional in-memory cache (node-cache). Cache only after auth/authorization. Key includes all filters/pagination/sort params — never key solely on `userId`. TTL 30-60s.

## 7. Security
- JWT bearer-token authentication required.
- Ownership enforced via authenticated token identity, not URL alone.
- Exclude payment method/card info entirely.
- Parameterized queries only; whitelist sortable fields.
- No sensitive data in logs.

## 8. Availability and Scalability
- Single Node process for this capstone (local deployment).
- Add `/health` endpoint.
- Monitor latency and error rates via console/structured logs.
- Horizontal scaling and load balancing noted as a future production concern, out of scope for local capstone deployment.

## 9. Observability
Structured console logs including request count, response status, latency, trace IDs. (OpenTelemetry noted as a production enhancement, out of scope for capstone.)

## 10. Key Design Decisions
- SQLite chosen for zero-setup local development, appropriate for capstone scale.
- Offset pagination used because the contract requires page metadata.
- Status filtering accepts one status only in v1.
- Currency values are ISO-4217 codes.
- Invalid date ranges return `400 Bad Request`.
- Pages beyond `totalPages` return `200 OK` with an empty array.
- Authorization is based on authenticated token identity, not solely the URL.

## 11. Items Requiring Review
- Confirm SQLite is acceptable vs. a "real" DB server for grading purposes.
- Confirm whether `endDate` without a time component should include the entire day.
- Confirm whether structured console logs satisfy the audit requirement, or a dedicated audit table is expected.