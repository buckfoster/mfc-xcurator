# MFC X Curator

Twitter List scraper + content browser for curating MFC content from X/Twitter. Daily automated scrape of a Twitter List via twitterapi.io, stores media in Directus (R2), browse in a grid UI, one-click save to `posts` collection as a draft for the existing social posting pipeline.

## Architecture

```
Twitter List (daily via N8N)
  ↓
twitterapi.io REST API → Download media → Upload to Directus Files (R2)
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
- **Scraping:** twitterapi.io REST API ($0.15/1K tweets)
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
| `text` | text | Tweet body |
| `media` | file (M2O → directus_files) | Uploaded image/video |
| `media_type` | string | `photo` / `video` / `animated_gif` |
| `like_count` | integer | |
| `retweet_count` | integer | |
| `view_count` | integer | |
| `tweeted_at` | datetime | When original was posted |
| `scraped_at` | datetime | When we scraped it |
| `status` | string, default `new` | `new` / `saved` / `dismissed` |

Dedup key: `tweet_id` + `media_index` (checked in N8N before insert).

## N8N Workflow

- **Name:** "MFC X List Scraper"
- **Schedule:** Daily at 6 AM ET
- **Manual trigger:** GET webhook at `/webhook/mfc-x-scraper`
- **Twitter List ID:** `1480080756906999808`
- **Flow:** Fetch tweets → filter media → dedup check → download → upload to Directus → create record
- **Exported JSON:** `n8n/scraper-workflow.json`

## Deployment

- **Coolify UUID:** TBD (set after Coolify app creation)
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
| twitterapi.io | ~$1 |
| R2 storage | Free tier |
| VPS/Coolify | Already running |
| **Total** | **~$1/month** |
