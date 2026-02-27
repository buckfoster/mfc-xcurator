# MFC X Curator

Twitter List scraper + content browser for curating MFC content from X/Twitter. Daily automated scrape of 628 handles via twitterapi.io search, stores media in Directus (R2), browse in a grid UI, one-click save to `posts` collection as a draft for the existing social posting pipeline.

## Architecture

```
628 handles (from Twitter List) → batched search queries
  ↓ (daily via N8N)
twitterapi.io Advanced Search → Download media → Upload to Directus Files (R2)
  ↓
Directus `scraped_tweets` collection (metadata + file refs)
  ↓
X Curator web app (xcurator.manlyfeet.club)
  ↓ ("Save to Posts" button)
Directus `posts` collection (draft) → existing posting pipeline
```

## Tech Stack

- **Backend:** Express.js (Node.js 22) with HTTP Basic Auth
- **Frontend:** Single-file HTML + CSS + vanilla JS (MFC design system)
- **Scraping:** twitterapi.io Advanced Search ($0.15/1K tweets, ~$3/month for 628 handles)
- **Storage:** Directus CMS + Cloudflare R2 (media.manlyfeet.club)
- **Automation:** N8N workflow on n8n.manlyfeet.club

## API Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /health` | none | Healthcheck |
| `GET /api/tweets` | basic | Query `scraped_tweets` (pagination, filters, sort) |
| `POST /api/save/:id` | basic | Copy media ref to `posts` as draft, mark `status=saved` |
| `POST /api/dismiss/:id` | basic | Mark `status=dismissed` |
| `GET /` | basic | Serve curator grid UI |

### Query Parameters for `/api/tweets`

| Param | Values | Default |
|-------|--------|---------|
| `status` | `new`, `saved`, `dismissed`, `all` | `new` |
| `media_type` | `photo`, `video` | (all) |
| `sort` | `date`, `engagement` | `date` |
| `page` | integer | `1` |
| `limit` | integer | `40` |

## Environment Variables

| Var | Description |
|-----|-------------|
| `PORT` | Server port (default 3300) |
| `ADMIN_USER` | HTTP Basic Auth username |
| `ADMIN_PASS` | HTTP Basic Auth password |
| `DIRECTUS_URL` | Directus instance URL |
| `DIRECTUS_TOKEN` | Directus API token (reuses existing N8N token) |
| `MEDIA_URL` | R2 media URL (https://media.manlyfeet.club) |

## Directus Collection: `scraped_tweets`

| Field | Type | Notes |
|-------|------|-------|
| `id` | integer (auto PK) | |
| `tweet_id` | string | Twitter's ID, for dedup |
| `media_index` | integer | 0-3 (which image in multi-photo tweet) |
| `tweet_url` | string | Link to original tweet |
| `author_handle` | string | @handle |
| `author_name` | string | Display name |
| `text` | text | Tweet body (unlimited length) |
| `media` | file (M2O → directus_files) | Uploaded image/video |
| `media_type` | string | `photo` / `video` / `animated_gif` |
| `like_count` | integer | |
| `retweet_count` | integer | |
| `view_count` | integer | |
| `tweeted_at` | datetime | When original was posted |
| `scraped_at` | datetime | When we scraped it |
| `status` | string, default `new` | `new` / `saved` / `dismissed` |

Dedup key: `tweet_id` + `media_index` (checked in N8N before insert).

### Directus Permissions

- Public policy: read on `scraped_tweets`, read on `directus_files`
- Administrator policy: read/create/update on `scraped_tweets`, read/create on `directus_files`

## N8N Workflow

- **Name:** "MFC X List Scraper"
- **Workflow ID:** `EfyMWpnfTey9oEUK`
- **Schedule:** Daily at 6 AM ET
- **Manual trigger:** GET webhook at `/webhook/mfc-x-scraper`
- **Twitter List URL:** `https://x.com/i/lists/1480080756906999808` (owner: @BuckFoster69)
- **Exported JSON:** `n8n/scraper-workflow.json`
- **Handle list:** `handles.txt` (628 handles, extracted via `console-scraper.js`)

### Workflow Flow

1. **Build Search Queries** (Code) — Batches 628 handles into ~29 queries of ~20 handles each. Format: `(from:h1 OR from:h2 OR ...) filter:media`. Max 490 chars per query.
2. **Search twitterapi.io** (HTTP Request) — `GET /twitter/tweet/advanced_search` with `X-API-Key` header. Batched 5 at a time with 1s interval.
3. **Extract Media Items** (Code) — Parses responses, extracts `extendedEntities.media`, validates CDN URLs, converts Twitter date format to ISO 8601.
4. **Check Dedup** (HTTP Request) — Public read on Directus, checks `tweet_id` + `media_index`.
5. **Is New?** (If) — Routes new items forward, skips duplicates.
6. **Download Media** (HTTP Request) — Downloads from Twitter CDN as binary.
7. **Upload to Directus Files** (HTTP Request) — Uploads to Directus/R2 with `$env.DIRECTUS_TOKEN`.
8. **Create Scraped Tweet** (HTTP Request) — Creates record in `scraped_tweets` with `$env.DIRECTUS_TOKEN`. Error handling: continues on error (skips bad items).

### N8N Environment Variables (in docker compose)

- `MFC_TWITTERAPI_KEY` — twitterapi.io API key
- `DIRECTUS_TOKEN` — Directus static token for writes
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` — Required for `$env` access in expressions

### Updating Handles

When the Twitter List membership changes:
1. Open `https://x.com/i/lists/1480080756906999808/members` in browser (logged in)
2. Run `console-scraper.js` content in browser console
3. When done, run `copy([...window._h].sort().join('\n'))` to copy handles
4. Update `handles.txt`
5. Re-inject handles into `n8n/scraper-workflow.json` (replace the HANDLES array in "Build Search Queries" Code node)
6. Push workflow to N8N via API

## Deployment

- **Coolify UUID:** rk8cokoww44w048sk4ks8g8g
- **Domain:** xcurator.manlyfeet.club
- **Port:** 3300
- **GitHub:** `buckfoster/mfc-xcurator`
- **Build:** Dockerfile (node:22-slim)
- **DNS:** A record → 76.13.107.141

## Save Action

When "Save to Posts" is clicked, the app:
1. Reads the `scraped_tweets` record (gets the Directus file ID)
2. Creates a `posts` record with `media: fileId, caption: "@author_handle", publish_at: null` (draft)
3. Marks the scraped tweet `status: saved`

The `@author_handle` caption serves as a credit line. Jordan edits caption/schedule in the feed scheduler before publishing.

## Local Development

```bash
cp .env.example .env  # fill in values
npm install
npm run dev           # starts with --watch on port 3300
```

## Cost

| Item | Monthly |
|------|---------|
| twitterapi.io (~30 batches/day) | ~$3 |
| R2 storage | Free tier |
| VPS/Coolify | Already running |
| **Total** | **~$3/month** |

## API Notes

- **twitterapi.io:** List endpoints are broken (return empty for ALL lists). Advanced Search works well. Uses `filter:media` (not `has:media`) for media tweets. Multi-handle OR queries work with up to ~20 handles per query.
- **N8N Code Node (v2.9.4):** Sandbox has NO `fetch`, `URLSearchParams`, `URL`, `$helpers`, or `$http`. Only basic JS + `$input`, `$env`, `DateTime`, `$jmespath`. ALL HTTP calls must use HTTP Request nodes.
- **Twitter date format:** `"Fri Feb 27 16:09:08 +0000 2026"` — must convert to ISO 8601 with `new Date().toISOString()`.
- **N8N httpHeaderAuth credential:** ID `sq08PeA6JIcAnrWI` exists but has auth issues with new collections. Workflow uses `$env.DIRECTUS_TOKEN` in Authorization headers instead.
