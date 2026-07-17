# OLX Dashboard

Multi-profil dashboard za automatizaciju OLX oglasa (TechZone i ostali profili).

## Lokalni razvoj

```bash
npm install
cp .env.example .env.local
# popuni Supabase i FEED_URL
npm run dev
```

## Worker skripte

| Skripta | Opis |
|---------|------|
| `npm run job:sync-feed` | Sinhronizacija feed-a u Supabase |
| `npm run job:sync-stock` | Hide/unhide po zalihi |
| `npm run job:post-listings:dry` | Post oglasa (dry-run) |
| `npm run job:refresh-prices:dry` | Osvježavanje cijena (dry-run) |
| `npm run seed:test-profiles` | Dodaje 2 test profila (paused) |

## GitHub Actions

Workflow-i u `.github/workflows/`:

- `sync-feed.yml` — dnevno 01:30 UTC
- `post-listings.yml` — 02:00 UTC, matrix po profilu
- `sync-stock.yml` — 02:00 UTC
- `refresh-prices.yml` — 03:30 UTC

### GitHub Secrets (repo Settings → Secrets)

| Secret | Opis |
|--------|------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `FEED_URL` | URL feed JSON-a |
| `FEED_API_KEY` | (opcionalno) API ključ feed-a |
| `FEED_AUTH_MODE` | `none` \| `apikey` \| `bearer` \| `both` |

## Vercel deploy

Postavi env varijable u Vercel projektu:

| Varijabla | Opis |
|-----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon key |
| `SUPABASE_SECRET_KEY` | Service role (server actions) |
| `GITHUB_REPO` | `owner/repo` za workflow dispatch |
| `GH_DISPATCH_TOKEN` | PAT sa `actions:write` |
| `GITHUB_REF` | Branch (default `main`) |
| `RESEND_API_KEY` | Resend API ključ |
| `RESEND_FROM_EMAIL` | Pošiljalac emaila |
| `ADMIN_NOTIFY_EMAIL` | Admin email za notifikacije |

## Smoke test lanca

```bash
npm run job:sync-feed
npm run job:sync-stock:dry
npm run job:post-listings:dry
npm run job:refresh-prices:dry
```

Provjeri `/logovi` u dashboardu nakon pokretanja.

## Napomena

- `POST_LISTINGS_MAX_PER_RUN` ostaje nizak (5) dok se ne uradi dedup i mapiranje kategorija.
- Kredencijali su u bazi (plain text); enkripcija je planirana kasnije.
