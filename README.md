# BloxSpin

Telegram Mini App with a Vercel API and Supabase database.

## Production architecture

- `index.html` — Mini App UI with local fallback and server synchronization.
- `admin.html` — owner-only administration panel.
- `api/game.js` — verified player actions and bootstrap endpoint.
- `api/admin.js` — verified owner operations.
- `api/_lib.js` — Telegram signature verification and Supabase REST client.
- `supabase/schema.sql` — tables, row-level security, atomic game functions, referrals, promos, seasons and tournaments.

## Items and inventory

Every item defines a category, rarity, combat bonuses and base Power. The inventory displays quantity, level, Power and equipped state, selects the strongest owned item automatically and supports category filters. Item upgrades currently have five levels, cost Coins and are saved in the player's existing server-side `upgrades` profile. The later ten-level material progression remains a separate roadmap stage.

## Setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Add every variable from `.env.example` to the Vercel project settings.
3. Redeploy the latest commit.
4. Open the Mini App from Telegram. The green status dot means the authoritative server is active.

The Supabase secret key is used only by Vercel functions. It must never be placed in client-side code.
