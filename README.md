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

The Spin page uses the BloxSpin machine with block items instead of fruit symbols: armor, weapons, pets, crystals, crowns and mystery items. It exposes the supported 100, 250 and 500 Coin stakes and previews all six reward tiers. Item drops use the exact roadmap distribution: Common 68%, Rare 24%, Epic 6.5%, Mythic 1.2%, Legendary 0.28% and Secret 0.02%. A dedicated reveal screen shows the item's rarity, name and Power; Legendary and Secret drops receive additional visual effects.

The PvE page offers five bot classes with distinct combat abilities and a server-authoritative turn-based battle system. Dedicated raid bosses use three health phases, escalating abilities, seasonal encounters and rare item drops. Survivor Mode adds real-time movement, automatic attacks, timed waves, run XP and one-of-three upgrade choices including Damage, Attack Speed, Double Shot, Orbiting Cube, Fire Aura, Critical Chance, pets and skill evolutions. PvP matchmaking shows the opponent profile, equipment and Power before a server-authoritative turn-based fight, then saves wins, losses and streaks. Asynchronous PvP lists real player profiles with activity status and lets the attacker fight a saved build while its owner is offline. If fewer than three players are available, the arena adds balanced training rivals so a new player can fight immediately. The Vercel API validates and saves combat rewards, boss progress and Survivor records.

Online PvP adds a live matchmaking queue, synchronized alternating turns and a shared result for both players. PvP rating advances through Bronze, Silver, Gold, Diamond, Master and Legend with monthly rewards. Players on a win streak carry a visible Bounty that is paid to the winner. Dragon Pet now has ten separate levels, evolving rarity, an increasing combat ability and a dedicated hero card.

Auras now have ten levels, evolving visual tiers and passive attack, defense and critical bonuses. The five-piece Cyber Sovereign set unlocks cumulative bonuses at 2/3/4/5 owned pieces and a full-set hero effect. Every item supports three server-saved evolution ranks that consume duplicates and Coins while increasing Power, combat stats and appearance. The Items screen also includes a server-backed shop for weapons, armor, pets, auras, materials and a monthly seasonal skin.

Shop prices are paced against a 30,000–70,000 Coin daily income target: ordinary gear takes one or more active days, Mythic and Legendary gear require longer saving, and Secret items are drop-only. Item sales remove a 10% fee. Every balance change is recorded in the economy ledger, and the shop displays the player's daily income and spending.

Digital purchases use Telegram Stars invoices and contain only explicit cosmetic products: profile frames, hero trails, victory effects, skins and a fixed Founder bundle. The server creates the invoice, validates Telegram pre-checkout updates, waits for `successful_payment`, records the Telegram charge, and only then grants and activates the cosmetic. Paid random spins are not offered.

## Setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Add every variable from `.env.example` to the Vercel project settings.
3. Redeploy the latest commit.
4. Open the Mini App from Telegram. The green status dot means the authoritative server is active.

The Supabase secret key is used only by Vercel functions. It must never be placed in client-side code.

- Five PvE bot classes (Tank, Assassin, Mage, Summoner, Boss), each with a distinct combat ability.
- Turn-based combat with HP, defense, critical hits, skills, pets, auras, victory and defeat states.
- Endless Tower with rising floor power, mini-bosses every 5 floors, major bosses every 10 floors, rewards, and a saved personal record.
