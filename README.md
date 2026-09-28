# Order History API

A local REST API for retrieving a user's order history with JWT authentication, status/date filtering, sorting, pagination, SQLite persistence, audit records, and interactive OpenAPI documentation.

## Prerequisites

- Node.js LTS and npm
- Windows PowerShell examples below use `curl.exe` to avoid PowerShell's `curl` alias.

## Local Setup

From the repository root:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` and set a private `JWT_SECRET`. The supported variables are:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP listen port | `3000` |
| `DB_PATH` | SQLite database file | `./db/order-history.sqlite` |
| `JWT_SECRET` | Required shared secret used to sign and validate tokens | None |
| `AUDIT_LOGS` | Set to `false` to suppress audit console output | Enabled outside tests |

Initialize and seed the local database, then start the API:

```powershell
npm run db:init
npm run db:seed
npm start
```

The seed command creates these users:

| User | UUID | Seed data |
| --- | --- | --- |
| History | `00000000-0000-4000-8000-000000000001` | 70 orders |
| Empty history | `00000000-0000-4000-8000-000000000002` | No orders |
| Disabled | `00000000-0000-4000-8000-000000000003` | Inactive; returns 404 |
| Soft-deleted | `00000000-0000-4000-8000-000000000004` | Inactive; returns 404 |
| Large history | `00000000-0000-4000-8000-000000000005` | 10,000 orders |

The health endpoint is public at `http://localhost:3000/health`. Interactive API docs are public at `http://localhost:3000/api-docs`; the raw OpenAPI document is at `http://localhost:3000/api-docs.json`.

## Generate a Token

Generate a one-hour JWT for the history user. The token is printed to the terminal; use its value in the requests below.

```powershell
npm run token -- <USER_ID>
```

Set the token for convenient use in PowerShell:

```powershell
$TOKEN = "paste-token-output-here"
```

## API Examples

Successful request with filters, sorting, and pagination:

```powershell
curl.exe -i "http://localhost:3000/api/v1/users/00000000-0000-4000-8000-000000000001/orders?status=Delivered&startDate=2025-01-01&endDate=2025-12-31&sortBy=total&sortOrder=desc&page=1&pageSize=10" -H "Authorization: Bearer $TOKEN"
```

401 Unauthorized (missing token):

```powershell
curl.exe -i "http://localhost:3000/api/v1/users/00000000-0000-4000-8000-000000000001/orders"
```

403 Forbidden (token subject and path user differ):

```powershell
curl.exe -i "http://localhost:3000/api/v1/users/00000000-0000-4000-8000-000000000002/orders" -H "Authorization: Bearer $TOKEN"
```

404 Not Found (generate a token for the disabled user with `npm run token -- <USER_ID>`, then use it here):

```powershell
curl.exe -i "http://localhost:3000/api/v1/users/00000000-0000-4000-8000-000000000003/orders" -H "Authorization: Bearer <disabled-user-token>"
```

400 Bad Request (invalid page size):

```powershell
curl.exe -i "http://localhost:3000/api/v1/users/00000000-0000-4000-8000-000000000001/orders?pageSize=101" -H "Authorization: Bearer $TOKEN"
```

## Tests

```powershell
npm test
```

## Project Docs

- [Requirements](requirements.md)
- [Architecture](architecture.md)
- [Design review](design-review.md)
- [Implementation plan](impl-plan.md)

## Known Limitations

Intentionally out of scope for this local capstone: enterprise JWT infrastructure, caching, rate limiting, backup and disaster recovery, and query-plan benchmarking.