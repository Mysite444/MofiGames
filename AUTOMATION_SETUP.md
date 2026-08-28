# Automation — setup

## 1. Run the migration
In Supabase SQL Editor, run `supabase/migrations/0016_automation.sql`. It:
- Adds `scheduled_publish_at`, `embed_status`, `link_status`, and import-tracking columns to `games`
- Creates `automation_jobs`, `automation_job_runs`, `automation_notifications`, `import_providers`, `import_rules`
- Creates a private `automation-backups` storage bucket
- Seeds the 19-job registry (all admin-editable afterwards)

## 2. Wire up the scheduler
Nothing runs on its own — an external scheduler needs to call the cron endpoint. Each job then runs on its own schedule (configured per-job in Admin → Automation), not on every tick.

1. Set `CRON_SECRET` in your deployment env (any random string) and make sure `SUPABASE_SERVICE_ROLE_KEY` is set (used to bypass RLS from the cron route).
2. Point a scheduler at `GET https://yourdomain.com/api/cron/automation` once a minute, sending `Authorization: Bearer <CRON_SECRET>`.
   - Vercel: add a Cron Job in `vercel.json` (`"crons": [{ "path": "/api/cron/automation", "schedule": "* * * * *" }]`) — Vercel signs these automatically, but since it can't send your secret header, use the `?secret=` query param variant instead, or a cron proxy.
   - Or use a free external pinger like cron-job.org / GitHub Actions on a schedule, hitting the URL with the header.

Until this is wired up, every job still works via the "Run now" button in Admin → Automation.

## 3. Optional integrations
- **Auto SEO Metadata** uses `ANTHROPIC_API_KEY` if set (falls back to a heuristic otherwise).
- **Email Notifications for Failed Jobs** / **Auto CDN Cache Purge** — set a webhook URL in that job's settings panel (Slack/Discord-compatible POST, or your CDN's purge webhook).
- **Auto Import Games** — add a provider under Admin → Automation → Imports. The feed URL must return a JSON array (or `{ "games": [...] }`) of game objects; map field names per-provider if they don't match `{id, title, description, thumbnail, url, category, tags}`.

## Where things are
- `supabase/migrations/0016_automation.sql` — schema
- `src/lib/automation/` — job executors, cron parser, import pipeline, run orchestrator
- `src/app/api/admin/automation/*`, `src/app/api/cron/automation` — API
- `src/app/admin/automation/*`, `src/components/admin/Automation*.tsx` — UI (Jobs & Schedules, Import Manager, Job Logs)
