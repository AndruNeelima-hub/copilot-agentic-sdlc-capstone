# Order History API Design Review

## 1. Review Summary

The proposed architecture is appropriate for the capstone's expected traffic and data volume. PostgreSQL, a stateless REST service, and offset pagination provide a simple implementation path.

The review identified risks in pagination consistency, date handling, data integrity, authorization privacy, validation, audit logging, item loading, caching, and operational scalability. The v1 triage below distinguishes required architecture updates from concerns intentionally deferred for this capstone.

## 2. Findings and Triage

### 2.1 Pagination Metadata

**Finding:** Separate count and data queries may observe different database states when orders change concurrently. Empty-result behavior and `totalPages` for zero records were not explicitly defined.

**Triage:** Fixed now.

- `totalPages = 0` when `totalRecords = 0`.
- Requests for pages beyond `totalPages` return `200 OK` with an empty `data` array.
- The implementation should document the consistency behavior of count and page queries.

### 2.2 Date Filtering

**Finding:** Date boundaries and timezone behavior were ambiguous.

**Triage:** Fixed now.

- All date filtering uses UTC.
- `startDate` is inclusive.
- `endDate` is inclusive of the full UTC day.
- If `startDate > endDate`, return `400 Bad Request` with `INVALID_DATE`.

### 2.3 Order Item Loading

**Finding:** Loading items separately for each order could create an N+1 query problem.

**Triage:** Fixed now.

- Load items with one batched query using `IN (...)` across all returned order IDs.
- Do not issue one item query per order.
- Map the returned items to their parent orders in application memory.

### 2.4 Database Integrity Constraints

**Finding:** The original data model did not specify sufficient database-level validation.

**Triage:** Fixed now.

Add constraints for:

- `quantity > 0`
- Non-negative monetary fields
- Allowed order statuses
- Unique `order_number`
- Foreign-key relationships

Money must use exact numeric types rather than floating-point types.

### 2.5 Authorization Privacy

**Finding:** A detailed `403 Forbidden` response could reveal whether another user's account exists.

**Triage:** Fixed now.

- Cross-user access returns `403 Forbidden`.
- The response uses a generic message.
- It must not reveal whether the requested user exists, is disabled, or is soft-deleted.

### 2.6 Duplicate Query Parameters

**Finding:** The behavior of repeated parameters such as `status=A&status=B` was unspecified.

**Triage:** Fixed now.

- Duplicate query parameters return `400 Bad Request`.
- This applies to all single-valued query parameters, including `page`, `pageSize`, `status`, `startDate`, `endDate`, `sortBy`, and `sortOrder`.

### 2.7 Stable Error Codes

**Finding:** Error handling lacked a complete, stable error-code contract.

**Triage:** Fixed now.

The supported error codes are:

- `INVALID_UUID`
- `INVALID_STATUS`
- `INVALID_DATE`
- `INVALID_PAGINATION`
- `INVALID_SORT`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `USER_NOT_FOUND`
- `INTERNAL_ERROR`

Each error returns the code in the standard error envelope.

### 2.8 Audit Logging

**Finding:** Unauthenticated requests cannot always be associated with a user ID, but the requirement applies to every request.

**Triage:** Fixed now.

- Audit unauthenticated requests.
- Use `userId: null` when no authenticated user is available.
- Record timestamp, outcome/status, trace ID, and request information.
- Do not log bearer tokens or other unnecessary sensitive data.

## 3. Additional Review Findings

### 3.1 Authentication Details

The full enterprise JWT profile remains outside the capstone scope. The v1 architecture uses a shared secret and validates the standard `sub` and `exp` claims.

Production systems would additionally require issuer and audience validation, key rotation, algorithm restrictions, and a formal key-management process.

### 3.2 Query Performance

Optional SQL predicates may produce less efficient query plans. Dynamic query construction or equivalent query-builder behavior should be used where practical.

Index effectiveness and query plans should be evaluated before production deployment.

### 3.3 Offset Pagination

Offset pagination is appropriate for the required page-number contract and the expected maximum of approximately 10,000 orders per user. It can become slower for very large offsets. Cursor pagination is a possible future enhancement but would require a different API contract.

### 3.4 Monetary Values

Monetary fields should use PostgreSQL `NUMERIC` with an explicitly selected precision and scale. API serialization should define whether values are represented as JSON numbers or strings.

### 3.5 Historical Order Data

Order responses should use historical snapshots of order item names and SKUs. They should not depend on mutable current product records.

### 3.6 Order Mutability

The implementation should define whether historical orders are immutable after creation. If orders can be changed, an order audit history may be needed in a future version.

### 3.7 Error Handling

Unexpected failures should return:

- HTTP `500 Internal Server Error`
- Error code `INTERNAL_ERROR`
- A generic message
- The request trace ID

Internal exception details must not be exposed to clients.

### 3.8 Observability

The service should emit metrics for request count, latency, status codes, database duration, and authentication failures. Logs should be structured and correlated using `X-Trace-Id`.

### 3.9 Timeout and Connection Controls

The implementation should configure:

- API request timeouts
- Database statement timeouts
- Connection-pool limits
- Maximum response sizes where appropriate

These controls reduce the risk of resource exhaustion.

## 4. Accepted as Out of Scope for This Capstone

### 4.1 Full Enterprise JWT Specification

**Decision:** Out of scope.

For v1, use a shared secret with standard `sub` and `exp` claim validation only.

**Why:** The capstone focuses on order-history behavior rather than enterprise identity infrastructure. Production deployment would require issuer/audience validation, key rotation, restricted algorithms, and managed key storage.

### 4.2 Redis Cache Encryption and Access Controls

**Decision:** Out of scope.

Redis is not used in this stack.

**Why:** The expected load does not require distributed caching for the capstone. If caching is introduced later, it must include authorization-aware keys, TTLs, encryption, access controls, and cache invalidation rules.

### 4.3 Backup, Failover, and Disaster Recovery

**Decision:** Out of scope.

These targets are not applicable to the local deployment.

**Why:** The capstone runs locally and does not provide production database infrastructure. Production deployment would require backup, restore testing, failover planning, and recovery objectives.

### 4.4 Rate Limiting and Concurrent-Request Throttling

**Decision:** Out of scope for v1.

**Why:** These are production concerns outside the capstone implementation. They should be added at the gateway or service layer before production exposure.

### 4.5 Query Plan Benchmarking with `EXPLAIN`

**Decision:** Out of scope for v1.

**Why:** The capstone does not include production-scale performance benchmarking. Query-plan analysis and realistic load testing should be completed before production deployment.

## 5. Required Implementation Review

Before implementation is considered complete, verify:

1. Empty histories produce `totalPages = 0`.
2. Date filters use UTC and an inclusive full-day `endDate`.
3. Items are loaded in one batched query.
4. Database constraints are implemented and tested.
5. Cross-user `403` responses use generic messages.
6. Duplicate query parameters return `400`.
7. All errors use the stable error-code set.
8. Unauthenticated requests are audited with `userId: null`.
9. Trace IDs are present on successful and error responses.
10. Sensitive authentication data is excluded from logs.

Security-sensitive behavior involving authentication, authorization, audit logs, and personal order data requires human review before production use.