# Barn B — Interactive Booking Map

Circle T Arena · Stall reservation map with real-time availability via Checkfront API v3.

## What This Is

An interactive visual map of Barn B stalls (200–429 + VIP RVs) that shows real-time
availability and lets customers reserve stalls directly. Built for deployment on Vercel.

### How It Works

```
Browser (index.html)          Vercel Serverless           Checkfront v3 API
┌─────────────────┐          ┌──────────────┐           ┌─────────────────┐
│  fetch('/api/   │  ──────> │ api/         │  ───────> │ /api/3.0/item   │
│   products')    │          │ products.js  │  <─────── │                 │
│                 │  <────── │              │           │                 │
│  fetch('/api/   │  ──────> │ api/         │  ───────> │ /api/3.0/item   │
│   availability')│          │ availability │  <─────── │  ?start_date=   │
│                 │  <────── │          .js │           │  &end_date=     │
└─────────────────┘          └──────────────┘           └─────────────────┘
   Same origin,               Runs server-side,          Authenticated or
   no CORS issues             holds API credentials      Public API
```

### What Changed From the Apps Script Version

| Before (Apps Script)                    | After (Vercel)                          |
|-----------------------------------------|-----------------------------------------|
| `google.script.run` calls              | `fetch('/api/...')` calls               |
| 11+ chunked batch requests             | 1 bulk availability request             |
| Served from Google's iframe sandbox    | Served from Vercel CDN (global edge)    |
| No URL routing / deep links            | Full URL state (`?checkin=...&stall=`)  |
| Apps Script execution quotas           | No quota limits                         |
| ~10-15s availability load              | ~1-3s availability load (estimated)     |

---

## Setup

### 1. Environment Variables

In Vercel Dashboard → your project → Settings → Environment Variables, add:

| Variable               | Value                              | Required? |
|------------------------|------------------------------------|-----------|
| `CF_SUBDOMAIN`         | `circle-t-arena`                   | Yes       |
| `CF_DOMAIN`            | `manage.na1.bookingplatform.app`   | Yes       |
| `CF_API_KEY`           | (from Config sheet B6)             | If Public API is off |
| `CF_API_SECRET`        | (from Config sheet B7)             | If Public API is off |
| `CF_BARN_B_CATEGORIES` | `3742,3752`                        | Optional (default in code) |

> **Once Circle T enables the Public API** (Manage > Developer > API toggle),
> you can remove `CF_API_KEY` and `CF_API_SECRET`. The serverless functions
> will make unauthenticated requests, which is simpler and just as capable
> for the customer-facing availability data.

### 2. Deploy

Push this repo to GitHub. Vercel auto-deploys on every push.

```bash
# First time — from inside this project folder:
git init
git add .
git commit -m "Initial commit — Barn B booking map"
git branch -M main
git remote add origin https://github.com/austnwelch/circle-t-barn-b.git
git push -u origin main
```

Then go to Vercel → New Project → Import from GitHub → select this repo.

### 3. Verify

- Visit the deployed URL
- Check that stall map loads
- Set dates and verify availability colors appear
- Click a stall and check the detail panel
- Test "Reserve This Stall" button

---

## Project Structure

```
circle-t-barn-b/
├── index.html              Static frontend (served at /)
├── api/
│   ├── products.js         GET /api/products — fetch stall catalog
│   └── availability.js     GET /api/availability — check availability + pricing
├── package.json
├── vercel.json             Vercel config (empty = auto-detect)
├── .env.example            Environment variable template
├── .gitignore
└── README.md
```

---

## API Routes

### `GET /api/products`

Fetches the product catalog for map building.

| Param        | Description                          |
|-------------|--------------------------------------|
| `categories` | Comma-separated Checkfront category IDs |

Returns: `{ products: [{ id, name, sku }] }`

### `GET /api/availability`

Fetches rated availability with pricing and booking SLIPs.

**Bulk mode** (all stalls at once):

| Param        | Description                          |
|-------------|--------------------------------------|
| `categories` | Comma-separated category IDs         |
| `start`      | Start date (YYYYMMDD)                |
| `end`        | End date (YYYYMMDD)                  |

Returns: `{ results: [{ itemId, available, slip, priceTitle, priceTotal }] }`

**Single item mode**:

| Param      | Description            |
|-----------|------------------------|
| `item_id`  | Checkfront item ID     |
| `start`    | Start date (YYYYMMDD)  |
| `end`      | End date (YYYYMMDD)    |

Returns: `{ itemId, available, slip, priceTitle, priceTotal }`

---

## Notes

- **v3 API field mapping**: The `normalizeItem()` function in `api/availability.js`
  maps v3 response fields to the format the frontend expects. You may need to adjust
  field names after testing against the real API. Run a test query via the Checkfront
  Developer Console (Manage > Developer > Console) to see the actual response structure.

- **Widget**: The Checkfront booking widget (`CHECKFRONT.Widget`) loads from their CDN
  and handles payment/form processing. The map just pre-selects the item and passes the SLIP.

- **Fallback**: If the API or map fails, a banner appears linking to the standard
  booking page so customers can still transact.
