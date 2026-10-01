# BloxSpin

Telegram Mini App with a Vercel API and Supabase database.

## Production architecture

- `index.html` — Mini App UI with local fallback and server synchronization.
- `admin.html` — owner-only administration panel.
- `api/game.js` — verified player actions and bootstrap endpoint.
- `api/admin.js` — verified owner operations.
- `api/_lib.js` — Telegram signature verification and Supabase REST client.
- `supabase/schema.sql` — tables, row-level security, atomic game functions, referrals, promos, seasons and tournaments.

## Setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Add every variable from `.env.example` to the Vercel project settings.
3. Redeploy the latest commit.
4. Open the Mini App from Telegram. The green status dot means the authoritative server is active.

The service role key is used only by Vercel functions. It must never be placed in client-side code.
