# Distributed URL Shortener & Analytics Platform

A high-performance, distributed microservices platform engineered for sub-millisecond URL redirection, durable clickstream telemetry, and real-time interactive analytics.

---

## Architecture Overview

```
                          [ Client / Web Browser ]
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           │                                                   │
           ▼                                                   ▼
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│     Interactive Web Dashboard   │                 │     High-Speed Redirection API  │
│   (Chart.js + Tailwind + SSR)   │                 │      (Port 3000 / Node.js)      │
└─────────────────────────────────┘                 └────────────────┬────────────────┘
                                                                     │
                                             ┌───────────────────────┴───────────────────────┐
                                             │ [Security & Resilience Layers]               │
                                             │ • Distributed Redis Rate Limiter (60 req/min) │
                                             │ • SSRF & Private IP Validator                │
                                             │ • Cache Penetration Negative Caching         │
                                             └───────────────────────┬───────────────────────┘
                                                                     │
                                     ┌───────────────────────────────┴───────────────────────────────┐
                                     ▼                                                               ▼
                          ┌─────────────────────┐                                         ┌─────────────────────┐
                          │     Redis Cache     │                                         │     PostgreSQL      │
                          │     (Port 6379)     │                                         │     (Port 5432)     │
                          │   Sub-ms Lookups    │                                         │   Relational Schema │
                          └──────────┬──────────┘                                         └─────────────────────┘
                                     │
                                     │ (Cache Hit / HTTP 302 Found)
                                     ▼
                                [ Client ]
                                     │
                                     │ (Async Non-Blocking Event Dispatch)
                                     ▼
                          ┌─────────────────────┐
                          │    Redis Streams    │
                          │ (stream:click_events│
                          └──────────┬──────────┘
                                     │
                                     │ Consumer Group: analytics_group (XREADGROUP + XACK)
                                     ▼
                          ┌─────────────────────┐
                          │    Analytics API    │
                          │ (Port 3001 / Node.js│
                          └──────────┬──────────┘
                                     │
                                     │ High-Velocity Ingestion & Compound Aggregations
                                     ▼
                          ┌─────────────────────┐
                          │       MongoDB       │
                          │    (Port 27017)     │
                          │ Raw Click Telemetry │
                          └─────────────────────┘
```

---

## Core Features

### 1. Interactive Analytics & Management Dashboard
- Accessible at **`http://localhost:3000/`** or **`http://localhost:3000/dashboard`**.
- **Interactive URL Shortener:** Generate short links with custom aliases or auto-generated Base62 nano-IDs. 1-click clipboard copy.
- **Visual Analytics Explorer (Chart.js):**
  - Live metric stat cards: Total Clicks, Unique Visitors, Top Referrer.
  - Interactive Clicks Over Time trend line chart.
  - Referrer distribution doughnut chart.
  - Client / Browser / Device breakdown doughnut chart.
  - Real-time clickstream event table auto-polling every 3 seconds.
  - Direct **"Test Click"** simulation button to trigger live metric increments.

### 2. Low-Latency Cache-First Routing
- Lookups check **Redis** (`url:<shortCode>`) first for sub-millisecond response times.
- Falls back to **PostgreSQL** on a cache miss, automatically repopulating Redis with configurable TTL (`CACHE_TTL_SECONDS=86400`).
- **Negative Caching:** Non-existent keys are cached in Redis (`url_404:<shortCode>`) for 60 seconds to protect PostgreSQL against cache penetration and database hammering.

### 3. Distributed Rate Limiting
- Enforced on `POST /api/urls` via Redis atomic sliding window counters (`INCR` + `EXPIRE`).
- Configured to 60 requests per minute per IP.
- Sets standard HTTP response headers:
  - `X-RateLimit-Limit`: Maximum requests permitted in window.
  - `X-RateLimit-Remaining`: Remaining request quota.
  - `X-RateLimit-Reset`: UNIX timestamp when the window resets.
- Returns `HTTP 429 Too Many Requests` with a `Retry-After` header when exceeded.

### 4. SSRF & Anti-Abuse URL Safety
- Validates protocols strictly (only `http:` and `https:`).
- Blocks loopback addresses (`localhost`, `127.0.0.1`, `::1`).
- Blocks private and link-local networks (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- Blocks AWS/Cloud Instance Metadata Services (`169.254.169.254`).
- Blocks self-referential redirect loops targeting the shortener's own host.

### 5. Durable Event Streaming (Redis Streams & Consumer Groups)
- Event dispatching appends to Redis Stream `stream:click_events` using `XADD`.
- Analytics Service subscribes via Consumer Group `analytics_group` using `XREADGROUP` and acknowledges using `XACK`.
- Guarantees **at-least-once delivery**: telemetry is never lost if the analytics container restarts or experiences a network blip.
- Parallel fallback to HTTP `POST /api/events` with timeout isolation ensures zero impact on user redirection latency.

### 6. Polyglot Persistence
- **PostgreSQL 17:** ACID-compliant URL mappings with unique B-tree indexing on `short_code`.
- **MongoDB 8:** High-write document store with compound indexes (`{ shortCode: 1, timestamp: -1 }`) for fast aggregation pipelines.
- **Redis 7:** In-memory caching, distributed rate limiting, and durable streaming log.

---

## Quick Start (Docker Compose)

### 1. Clone and Configure
```bash
git clone <repository_url>
cd distributed-url-shortener
cp .env.example .env
```

### 2. Start the Infrastructure & Services
```bash
docker compose up -d --build
```

### 3. Verify Container Health
```bash
docker compose ps
```
All 5 containers should be running and healthy:
- `url-shortener-postgres` (Port 5432)
- `url-shortener-mongodb` (Port 27017)
- `url-shortener-redis` (Port 6379)
- `url-shortener-redirection-api` (Port 3000)
- `url-shortener-analytics-api` (Port 3001)

### 4. Open the Web Dashboard
Navigate to:
```
http://localhost:3000
```

---

## API Documentation

### 1. Redirection API (`http://localhost:3000`)

| Method | Path | Description | Response Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/` or `/dashboard` | Interactive Web Analytics Dashboard | `200 OK` (HTML) |
| `POST` | `/api/urls` | Create short URL (Rate Limited: 60/min) | `201 Created`, `400 Bad Request`, `429 Too Many Requests` |
| `GET` | `/api/urls/:code` | Retrieve short URL metadata | `200 OK`, `404 Not Found` |
| `GET` | `/:code` | Redirect to original target URL | `302 Found`, `404 Not Found` |
| `GET` | `/api/analytics/:code` | Proxy: Fetch aggregated telemetry metrics | `200 OK`, `502 Bad Gateway` |
| `GET` | `/api/analytics/:code/events`| Proxy: Fetch raw telemetry events log | `200 OK`, `502 Bad Gateway` |
| `GET` | `/health` | System health check (PostgreSQL & Redis) | `200 OK`, `503 Service Unavailable` |

#### Create Short URL Example
```bash
curl -i -X POST http://localhost:3000/api/urls \
  -H "Content-Type: application/json" \
  -d '{"url": "https://kubernetes.io", "customCode": "k8s"}'
```

#### Redirection Example
```bash
curl -i http://localhost:3000/k8s
```

---

### 2. Analytics API (`http://localhost:3001`)

| Method | Path | Description | Response Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/analytics/:code` | Aggregated analytics for a short code | `200 OK` |
| `GET` | `/api/analytics/:code/events` | Paginated raw event log (`?limit=50&skip=0`) | `200 OK` |
| `POST` | `/api/events` | Direct HTTP event ingestion endpoint | `202 Accepted`, `400 Bad Request` |
| `GET` | `/health` | Service health check (MongoDB & Redis stream worker) | `200 OK`, `503 Service Unavailable` |

#### Query Analytics Example
```bash
curl -s http://localhost:3001/api/analytics/k8s
```

---

## Running Tests

Automated test suites cover URL validation, SSRF protection, redirection logic, caching fallbacks, rate limiting, and MongoDB aggregation pipelines:

```bash
# Run test suites across both microservices
npm test

# Run tests individually
npm test --prefix redirection-api
npm test --prefix analytics-api
```

---

## CI / CD Pipeline

A GitHub Actions workflow is provided at `.github/workflows/ci.yml` that triggers on pull requests and pushes to `main`:
- Spins up containerized PostgreSQL, MongoDB (with Linux kernel 6.19+ `GLIBC_TUNABLES` fix), and Redis.
- Lints, compiles TypeScript, and runs Vitest unit and integration suites (15/15 tests passing).
- Tests and verifies multi-stage production Docker image builds.
