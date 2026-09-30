# Order History API Architecture

## 1. Recommended Tech Stack

- **Language and framework:** Node.js (LTS) with Express
- **Database:** SQLite (single file, e.g. `orders.db`)
- **Query layer:** better-sqlite3
- **Authentication:** Token-based (JWT via jsonwebtoken), shared secret, standard `sub` and `exp` claim validation
- **Validation:** Zod
- **Caching:** None for v1
- **Documentation:** OpenAPI 3 via swagger-jsdoc + swagger-ui-express
- **Observability:** Structured logging, metrics, and trace IDs
- **Deployment:** Local single Node process (optionally containerized)
- **Testing:** Jest + Supertest

Enterprise JWT features such as issuer/audience validation, key rotation, and managed key infrastructure are outside this capstone's scope.

## Implementation deviations

- **Money precision:** SQLite `REAL` storage is retained for this capstone, deviating from design-review sections 2.4 and 3.4, which recommend exact numeric storage. Monetary values are rounded to two decimal places in the response mapper. Integer minor units are future work if exact storage is required.
- **Unknown query parameters:** Unknown query parameters are intentionally ignored; supported single-valued parameters are validated and rejected when duplicated.

## 2. Component Breakdown

```text
Client
  |
  v
Express App
  |
  +-- Trace and Request Middleware
  +-- Authentication Middleware
  +-- Query Validation (Zod)
  +-- Authorization Check
  +-- Order History Route/Controller
  +-- Order History Service
  +-- User Repository (SQLite)
  +-- Order Repository (SQLite)
  +-- Response Mapper
  +-- Audit Logger
  |
  +-- SQLite (orders.db)
  +-- OpenAPI Documentation
  +-- Application Logs and Metrics
```

### 2.1 Trace and Request Middleware
- Create or propagate `X-Trace-Id`.
- Include `X-Trace-Id` in every response.
- Record request duration and response status.
- Convert unexpected exceptions into the standard error response envelope.
- Ensure audit logging occurs for successful, failed, and unauthenticated requests.

### 2.2 Authentication Middleware
- Read the bearer token.
- Validate the token using the configured shared secret (jsonwebtoken).
- Validate the standard `sub` and `exp` claims.
- Extract the authenticated user UUID from `sub`.
- Return `401 Unauthorized` with error code `UNAUTHORIZED` for a missing or invalid token.

The path `userId` must not be trusted as proof of identity.

### 2.3 Order History Route/Controller
Expose:
```text
GET /api/v1/users/:userId/orders
```
- Parses path and query parameters.
- Detects duplicate query parameters.
- Applies defaults.
- Delegates business logic to the service layer.
- Returns the standard success or error envelope.

Defaults: `page=1`, `pageSize=20`, `sortBy=date`, `sortOrder=desc`.

### 2.4 Query Validation (Zod)
Validate before querying the database:
- `userId` is a valid UUID.
- `page >= 1`.
- `1 <= pageSize <= 100`.
- `status` is one supported single value.
- Dates use the supported date format.
- `startDate <= endDate`.
- `sortBy` is `date` or `total`.
- `sortOrder` is `asc` or `desc`.
- No supported single-valued query parameter appears more than once.

Validation error codes: `INVALID_UUID`, `INVALID_STATUS`, `INVALID_DATE`, `INVALID_PAGINATION`, `INVALID_SORT`. All return `400 Bad Request`. Duplicate query parameters (e.g. `status=A&status=B`) also return `400 Bad Request`.

### 2.5 Date Filtering
All date filtering uses UTC.
- `startDate` is inclusive from `00:00:00 UTC`.
- `endDate` is inclusive through the end of the specified UTC day.
- If only one boundary is supplied, the other is unbounded.
- If `startDate > endDate`, return `400 Bad Request` with code `INVALID_DATE`.

Date-only inputs are translated into UTC timestamp boundaries rather than compared using local server time.

### 2.6 Authorization and User Validation
1. Authenticate the request.
2. Compare the authenticated token subject with the path `userId`.
3. Return `403 Forbidden` with code `FORBIDDEN` if they differ, using a **generic message** that does not reveal whether the requested user exists, is disabled, or is soft-deleted.
4. If the authenticated user matches the path user, verify that the user exists and is active.
5. Return `404 Not Found` with code `USER_NOT_FOUND` when the user does not exist, is disabled, or is soft-deleted.
6. Query only the authorized user's orders.

Example generic forbidden response:
```json
{ "error": { "code": "FORBIDDEN", "message": "Access denied", "traceId": "trace-id" } }
```

### 2.7 Order History Service
Coordinates: user validation, filter construction, sorting, pagination, total count calculation, pagination metadata generation, batch item loading, DTO mapping, audit logging.

Behavior:
- A valid user with no orders returns `200 OK` with `"data": []`.
- `totalRecords = 0` results in `totalPages = 0`.
- A page greater than `totalPages` returns `200 OK` with an empty `data` array.
- `currentPage` equals the requested page, including when it exceeds `totalPages`.
- `hasNextPage` is `false` when there are no additional records.

### 2.8 Repository Layer (better-sqlite3)
Use parameterized queries; whitelist sortable columns — never interpolate user-provided sort values directly into SQL.

```sql
SELECT id, user_id, order_number, order_date, status,
       subtotal, tax, shipping, discount, total, currency
FROM orders
WHERE user_id = ?
  AND (? IS NULL OR status = ?)
  AND (? IS NULL OR order_date >= ?)
  AND (? IS NULL OR order_date <= ?)
ORDER BY order_date DESC, id DESC
LIMIT ? OFFSET ?;
```

The count query applies the same filters.

### 2.9 Batch Order-Item Loading
Do not load items with one query per order.

1. Collect all returned order IDs.
2. Execute one item query using `IN (...)`.
3. Group the returned items by `order_id`.
4. Attach the grouped items to their corresponding orders.
5. Return an empty `items` array if an order has no items.

```sql
SELECT id, order_id, product_name, sku, quantity, unit_price, line_total
FROM order_items
WHERE order_id IN (...)
ORDER BY order_id, id;
```

If no order IDs are returned, skip the item query.

### 2.10 Response Mapping
Order DTO: `orderId`, `orderNumber`, `date`, `status`, `items`, `subtotal`, `tax`, `shipping`, `discount`, `total`, `currency`.
Item DTO: `itemId`, `productName`, `sku`, `quantity`, `unitPrice`, `lineTotal`.

Use camelCase JSON fields. Do not expose payment information or internal database fields.

### 2.11 Audit Logging
Audit every endpoint invocation, including unauthenticated requests.

Record: `userId` (or `null` when unauthenticated), requested path user ID where available, timestamp, trace ID, HTTP method and route, outcome/status code, request duration.

Do not log: bearer tokens, passwords, full authorization headers, unnecessary personal or financial information.

```json
{ "userId": null, "traceId": "trace-id", "route": "GET /api/v1/users/:userId/orders", "status": 401, "timestamp": "2026-09-16T12:00:00Z" }
```

## 3. Data Model

### 3.1 `users`
| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `status` | TEXT | Required |
| `disabled_at` | TEXT (ISO datetime) | Nullable |
| `deleted_at` | TEXT (ISO datetime) | Nullable |

A user is considered unavailable when it does not exist, is disabled, or is soft-deleted.

### 3.2 `orders`
| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `user_id` | TEXT (UUID) | Required, FK to `users.id` |
| `order_number` | TEXT | Required, unique |
| `order_date` | TEXT (ISO datetime) | Required |
| `status` | TEXT | Required, constrained to allowed values |
| `subtotal` | REAL | Required, non-negative |
| `tax` | REAL | Required, non-negative |
| `shipping` | REAL | Required, non-negative |
| `discount` | REAL | Required, non-negative |
| `total` | REAL | Required, non-negative |
| `currency` | TEXT(3) | Required ISO-4217 code |

Allowed statuses: `Pending`, `Processing`, `Shipped`, `Delivered`, `Cancelled`, `Refunded`, `Returned`.

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  order_number TEXT NOT NULL UNIQUE,
  order_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'Pending','Processing','Shipped','Delivered','Cancelled','Refunded','Returned'
  )),
  subtotal REAL NOT NULL CHECK (subtotal >= 0),
  tax REAL NOT NULL CHECK (tax >= 0),
  shipping REAL NOT NULL CHECK (shipping >= 0),
  discount REAL NOT NULL CHECK (discount >= 0),
  total REAL NOT NULL CHECK (total >= 0),
  currency TEXT(3) NOT NULL
);
```

### 3.3 `order_items`
| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `order_id` | TEXT (UUID) | Required, FK to `orders.id` |
| `product_name` | TEXT | Required |
| `sku` | TEXT | Required |
| `quantity` | INTEGER | Required, greater than zero |
| `unit_price` | REAL | Required, non-negative |
| `line_total` | REAL | Required, non-negative |

```sql
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  line_total REAL NOT NULL CHECK (line_total >= 0)
);
```

Order item names/SKUs represent historical values at time of purchase, not mutable current product data.

### 3.4 Recommended Indexes
```sql
CREATE INDEX idx_orders_user_date ON orders(user_id, order_date DESC);
CREATE INDEX idx_orders_user_status_date ON orders(user_id, status, order_date DESC);
CREATE INDEX idx_orders_user_total ON orders(user_id, total);
CREATE INDEX idx_order_items_order ON order_items(order_id);
```

## 4. API Error Contract

```json
{ "error": { "code": "ERROR_CODE", "message": "Human readable message", "traceId": "trace-id" } }
```

| Code | HTTP status | Meaning |
|---|---:|---|
| `INVALID_UUID` | 400 | A UUID value is malformed |
| `INVALID_STATUS` | 400 | Status is unsupported or duplicated |
| `INVALID_DATE` | 400 | Date is malformed or the range is invalid |
| `INVALID_PAGINATION` | 400 | Page or page size is invalid |
| `INVALID_SORT` | 400 | Sort field, order, or parameter multiplicity is invalid |
| `UNAUTHORIZED` | 401 | Authentication is missing or invalid |
| `FORBIDDEN` | 403 | Authenticated user is not allowed to access the requested path |
| `USER_NOT_FOUND` | 404 | User does not exist, is disabled, or is soft-deleted |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

Unexpected errors use a generic message and never expose stack traces or database details.

## 5. Data Flow
1. Client sends request with bearer token and optional query parameters.
2. Trace middleware creates/propagates `X-Trace-Id`.
3. Authentication middleware validates the token.
4. If authentication fails, audit with `userId: null`, return `401`.
5. If it succeeds, extract authenticated UUID from `sub`.
6. Controller parses path/query parameters.
7. Duplicate query parameters are detected and return `400`.
8. Zod validation checks UUID, pagination, status, dates, sorting.
9. Invalid input returns `400` with the appropriate stable error code.
10. Authorization compares authenticated UUID with `:userId`.
11. Mismatch returns generic `403 Forbidden`.
12. User repository verifies the requested user exists and is active.
13. Missing/disabled/soft-deleted user returns `404 USER_NOT_FOUND`.
14. Service executes the filtered count query.
15. Service executes the paginated order query.
16. Service collects returned order IDs.
17. Single batched item query loads all items via `IN (...)`.
18. Service groups items by order ID and maps to response DTOs.
19. Service calculates pagination metadata.
20. Request is audited with the authenticated user ID and outcome.
21. Response returned with `X-Trace-Id` header.

## 6. Pagination and Sorting

Offset pagination is used because the contract requires page numbers, total records, total pages, and arbitrary page access.

```text
offset = (page - 1) * pageSize
```

- Page numbering starts at 1; default `pageSize` = 20; max `pageSize` = 100.
- `pageSize < 1` or `> 100`, or `page < 1` → `INVALID_PAGINATION`.
- `totalPages = ceil(totalRecords / pageSize)` when `totalRecords > 0`; `totalPages = 0` when `totalRecords = 0`.
- A page beyond `totalPages` returns `200 OK` with an empty `data` array.

Deterministic tie-breakers: `ORDER BY order_date DESC, id DESC` (or `total DESC, id DESC`).
Supported: `sortBy=date|total`, `sortOrder=asc|desc`. Invalid/duplicated sort params → `400 INVALID_SORT`.

## 7. Security
- Require bearer-token authentication (JWT, shared secret).
- Validate standard `sub` and `exp` claims.
- Enforce ownership using the authenticated token identity.
- Generic messages for cross-user `403` responses.
- Exclude payment method/card information entirely.
- Parameterized queries only; whitelist sortable fields.
- No bearer tokens in logs; no internal exception details exposed to clients.
- Audit unauthenticated requests with `userId: null`.

Full enterprise JWT validation and key-management practices are outside the capstone scope.

## 8. Availability and Scalability
Designed for local capstone deployment and the stated functional load targets.
- Stateless API process.
- Connection handling via better-sqlite3 (synchronous, single-file).
- Configure API timeouts.
- Avoid N+1 queries via batched item loading.
- Indexes support user/status/date/total/item lookups.
- Page size capped at 100.

Out of scope for this capstone: rate limiting, concurrent-request throttling, database failover, backup/restore, disaster recovery, distributed cache infrastructure, production query-plan benchmarking.

## 9. Observability
Collect: request count, response status distribution, latency, database query duration, auth/authorization failures, validation failures, trace IDs, audit outcomes. Structured logs; every response includes `X-Trace-Id`.

## 10. API Documentation
Document with OpenAPI 3 (swagger-jsdoc + swagger-ui-express): bearer auth, path/query parameters, defaults, validation constraints, success schema, pagination metadata, all stable error codes, `X-Trace-Id` header, examples for auth/validation/not-found/internal errors.

## 11. Key Design Decisions
- SQLite chosen for zero-setup local development at capstone scale.
- Offset pagination used because the contract requires page-number metadata.
- Status filtering accepts one status only in v1.
- Duplicate query parameters return `400 Bad Request`.
- Currency values are ISO-4217 codes.
- All date filtering uses UTC; `endDate` includes the full UTC day.
- Invalid date ranges return `400 Bad Request`.
- Pages beyond `totalPages` return `200 OK` with an empty array; empty histories have `totalPages = 0`.
- Order items are batch-loaded in one query across returned order IDs.
- Database constraints enforce valid quantities, monetary values, statuses, and unique order numbers.
- Authorization is based on the authenticated token identity; cross-user forbidden responses use generic messages.
- All requests, including unauthenticated ones, are audited.