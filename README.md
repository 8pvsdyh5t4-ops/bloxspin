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

Every item defines a category, rarity, combat bonuses and base Power. The inventory displays quantity, level, Power and equipped state, selects the strongest owned item automatically and supports category filters. Item upgrades have ten levels, increasing Coin costs and duplicate-item material requirements from level 4. Levels and material consumption are saved in the player's server-side profile and inventory.

The Play page uses the BloxSpin machine with block items instead of fruit symbols: armor, weapons, pets, crystals, crowns and mystery items. It exposes the supported 100, 250 and 500 Coin stakes and previews all six reward tiers; exact roadmap drop percentages remain a later stage.

## Setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Add every variable from `.env.example` to the Vercel project settings.
3. Redeploy the latest commit.
4. Open the Mini App from Telegram. The green status dot means the authoritative server is active.

The Supabase secret key is used only by Vercel functions. It must never be placed in client-side code.
