# Roadmap 42–50: implementation and release status

Base: `1dc5ebfb6abd61ac08b4a12e9253e9338d425bef`.
Working branch: `feat/roadmap-42-50`.

## Implemented

- 42: Power, PvP, Tower, Survivor, Clans and Season tabs use `globalRankings`; current player highlighting, empty states, keyboard navigation and escaping of player names.
- 43: owner admin shows economy, promos, tournaments, audit and configuration; grants Coins/Crystals/items, bans/unbans, server-side player search, promo/event activation controls. The ambiguous economy `amount` reference in the existing DB function was fixed.
- 44: promo creation supports Coins, Crystals, items and cosmetic product IDs, use limits, level and start/end dates. API validates inputs. Redemption blocks duplicate clicks and shows currency changes. Fixed cosmetic grants when `upgrades.cosmetics` did not previously exist.
- 45: active equipment changes synchronize into `player_equipment`; snapshots include owned equipment. Existing single-active-item combat calculations are preserved. This does not introduce simultaneous combat bonuses from six slots.
- 46: persistent request receipts serialize player mutations across function instances; matching retries replay their stored response. Changed-payload reuse is refused. Abandoned requests are marked uncertain after two minutes, beyond the configured 60-second execution cap; their IDs are never re-executed. Bans apply at the API entry point. Telegram validation rejects duplicate keys, invalid IDs, stale/future timestamps and malformed hashes. Explicit owner IDs take priority over usernames.
- 47: optional page/reward transitions and button feedback, respecting reduced motion.
- 48: opt-in synthesized sounds for taps, spins, rewards and battle results; preference persists and audio suspends in background.
- 49: safe-area updates, viewport fitting, 44px button targets, readable form inputs and no horizontal overflow in tested widths. Existing art has WebP copies: 6,266,353 bytes → 843,940 bytes.
- 50: ranking layout and state styling, focus indicators, accessible promo input, status announcements; build publishes only frontend assets in `dist`.

## Verification

- `node scripts/build.cjs`: syntax and asset checks, static output.
- `node --test tests/*.test.cjs`: 12 tests covering Telegram validation, promo input, cached/concurrent requests, bans, server PvE and Tower reward behavior.
- Browser checks with Edge/Playwright: local PvE attack, persisted sound toggle, six ranking tabs and authenticated admin using fixtures; 320/390/768px widths; no JavaScript page errors.
- Live Supabase rollback tests: combined promo reward including cosmetics, duplicate redemption refusal, Crystal grant, equipment snapshot, request replay/serialization and expired-lease behavior. Test rows rolled back.
- Supabase security advisor returned INFO notices for server-only tables with RLS and no client policies; no warning/error findings in the inspected result. This is intentional for service-role-only access. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Applied to Supabase

The four dated migrations from `20261003203159` through `20261003204143` are already applied to project `iygorpzocptfwtctvzvp`. Do not manually rerun them against production; use migration history.

## Release blocked / remaining verification

GitHub connector returned 403 `Resource not accessible by integration` for branch creation. Vercel's advertised deployment tool returned `Tool deploy_to_vercel not found`. No new commit has been published or deployed. Production remains at the base commit above; its inspected runtime logs showed no errors.

After write access is restored: push this branch, create a reviewable PR, inspect the Vercel preview build, exercise real signed Telegram player and owner sessions, verify online two-player PvP and Survivor, then promote/merge and inspect production runtime errors. A fixture browser test is not a real Telegram end-to-end test.

The request guard prevents duplicate execution for the same request ID; it does not make legacy multi-call REST operations one database transaction. A process failure can leave a partial operation, returned as uncertain, and requires state reconciliation. Survivor still uses server time/nonce and bounded client reports rather than a fully server-simulated run. These limits must not be described as comprehensive anti-cheat.

Configure `OWNER_TELEGRAM_IDS` for stable production owner authorization; existing username fallback remains for compatibility when the variable is absent.
