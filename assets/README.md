# BloxSpin artwork

Created with the built-in ImageGen tool using the user's approved six-screen BloxSpin reference supplied on 2026-10-01. These are recreated production assets, not crops of the mockup.

- `bloxspin-logo.png`: wide 3:1 BloxSpin header; chunky extruded gold/orange and pink/purple lettering, golden crown, violet cubic city, blue crystals, no phone frame or controls.
- `cyber-world.png`: square loading and seasonal artwork; blocky brown-haired hero, purple sunglasses, black crown T-shirt, purple crystal sword, floating black cubic cat with cyan eyes, neon cyber city; no text or UI.
- `hero-loadout.png`: transparent full-body hero used on the equipment screen. Built-in ImageGen prompt: "Use case: stylized-concept. Asset type: transparent character cutout for the BloxSpin mobile hero equipment screen. Use the attached approved six-screen mockup as the visual reference, especially the top-right screen labeled 3. ГЕРОЙ. Create one full-body front three-quarter blocky boy hero matching that screen: chunky brown block hair, purple luminous visor sunglasses, black T-shirt with a large glowing yellow crown emblem, black pants, black-purple arm bracers and boots. He holds one oversized faceted neon-purple crystal sword with a gold hilt in his right hand. Add one small floating black cubic cat pet with pointed purple ears and bright cyan eyes near his upper right shoulder. Add a restrained circular violet aura behind the hero and a small golden crown accessory floating just above his head. Premium polished glossy 3D mobile game render, strong violet and cyan rim lighting, crisp readable silhouette. Composition: entire body and sword visible with comfortable transparent padding, centered vertically, hero occupies roughly 78% height. Transparent background with genuine alpha. Constraints: no scene, no ground, no city, no UI, no text, no labels, no phone frame, no second character, no dragon, no medieval plate armor, no watermark."
- `spin-machine.webp`: golden three-reel machine artwork for the Spin screen, with violet crystal lighting.
- `pve-atlas.webp`: four-panel encounter atlas for the tank, assassin, dragon boss and tower cards on the PvE screen.
- `pvp-arena.webp`: neon violet arena illustration with the player hero facing a red-armored rival.
- `item-atlas.webp`: compact 3D inventory atlas containing the six base item families and three advanced drops.
- `battle-atlas.webp`: nine-cell combat atlas containing the player hero, four standard PvE enemies, Inferno Golem, Cyber Dragon, Eclipse Lord and Tower Guardian. It supplies consistent full character art to battles, bosses, tower and Survivor.
- `world-atlas.webp`: nine-cell world atlas for player avatars, PvP rivals, the shop, market, clans, rankings, locked collection states and achievements.

The loading screen waits for its decoded images, fonts, Telegram SDK readiness, the player bootstrap and the first rendered frame. Its five progress steps measure readiness, not downloaded bytes. Failed authenticated bootstraps show retry instead of opening a local account.

Crystals show a dash until an actual server field exists. The six main screens use the same gold, violet, cyan and deep-blue visual language as the approved reference while preserving the existing game flows.

The hero equipment screen maps the collection to six simultaneous roles: crown → Crown, sword → Weapon, block → Armor, pet → Pet, crystal → Aura, secret → Skin. Advanced drops replace the item in their matching slot.

Hero characteristics are derived deterministically from synchronized player progression and the sum of every equipped slot. The screen shows HP, attack, defense, speed, critical chance, critical damage and a weighted overall Power. The same Power is used by Home and combat and updates immediately after equipment changes.

Verified locally at 320px and 390px widths: existing browser save, server-backed profile using isolated fixtures, delayed bootstrap, failed bootstrap/retry state, unavailable local storage, daily claim and disabled claimed state, Spin and season shortcuts. Real production mutations are not used for UI tests.
