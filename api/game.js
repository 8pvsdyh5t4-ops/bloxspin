const crypto = require('crypto');
const { json, readBody, verifyTelegram, isOwner, supabase, rpc, publicUser } = require('./_lib');

const itemUpgradeBase = { block: 50, sword: 150, pet: 400, crystal: 900, crown: 2000, secret: 5000 };
const combatItems = {
  block: { basePower: 180, stats: { hp: 180, defense: 110 } },
  sword: { basePower: 420, stats: { attack: 220, crit: 3 } },
  pet: { basePower: 760, stats: { attack: 140, speed: 10 } },
  crystal: { basePower: 1150, stats: { defense: 180, critDamage: 30 } },
  crown: { basePower: 1850, stats: { hp: 650, crit: 7 } },
  secret: { basePower: 2850, stats: { hp: 800, attack: 420, defense: 320, speed: 14, crit: 8, critDamage: 45 } }
};
const pveEnemies = {
  raider: { power: 1200, reward: [100, 500], xp: 40 },
  warden: { power: 4500, reward: [500, 2000], xp: 90 },
  golem: { power: 12000, reward: [2000, 10000], xp: 220 }
};
const rollDropId = () => {
  const roll = crypto.randomInt(10000);
  if (roll < 6800) return 'block';
  if (roll < 9200) return 'sword';
  if (roll < 9850) return 'pet';
  if (roll < 9970) return 'crystal';
  if (roll < 9998) return 'crown';
  return 'secret';
};

async function normalizeSpinDrop(user, payload) {
  const oldItem = payload?.event?.drop;
  if (!oldItem) return payload;
  const nextItem = rollDropId();
  if (oldItem === nextItem) return payload;
  const uid = Number(user.id);
  const oldCount = Number(payload.inventory?.[oldItem]) || 0;
  if (oldCount < 1) throw new Error('Drop inventory is out of sync');
  const nextRows = await supabase('inventory', { query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(nextItem)}&select=count` });
  const nextCount = Number(nextRows?.[0]?.count) || 0;
  const removed = await supabase('inventory', {
    method: 'PATCH',
    query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(oldItem)}&count=eq.${oldCount}`,
    body: { count: oldCount - 1 }
  });
  if (!removed?.length) throw new Error('Drop inventory changed, try again');
  try {
    await supabase('inventory', {
      method: 'POST',
      query: '?on_conflict=player_id,item_id',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: { player_id: uid, item_id: nextItem, count: nextCount + 1, discovered: true }
    });
  } catch (error) {
    await supabase('inventory', {
      method: 'PATCH',
      query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(oldItem)}&count=eq.${oldCount - 1}`,
      body: { count: oldCount }
    }).catch(() => {});
    throw error;
  }
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { ...payload.event, drop: nextItem };
  return snapshot;
}

function calculateHeroPower(player, inventory) {
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const itemLevels = upgrades.itemLevels && typeof upgrades.itemLevels === 'object' ? upgrades.itemLevels : {};
  const level = Math.max(1, Number(player.level) || 1);
  const owned = inventory.filter(row => Number(row.count) > 0).length;
  const equippedId = inventory.some(row => row.item_id === player.equipped_id && Number(row.count) > 0) ? player.equipped_id : '';
  const equipped = combatItems[equippedId];
  const itemLevel = Math.max(1, Math.min(10, Number(itemLevels[equippedId]) || 1));
  const scale = 1 + (itemLevel - 1) * 0.15;
  const bonus = Object.fromEntries(Object.entries(equipped?.stats || {}).map(([key, value]) => [key, Math.round(value * scale)]));
  const luck = Number(upgrades.luck) || 0;
  const xpBoost = Number(upgrades.xp) || 0;
  const hp = 1200 + (level - 1) * 200 + owned * 40 + (bonus.hp || 0);
  const attack = 420 + (level - 1) * 80 + luck * 25 + (bonus.attack || 0);
  const defense = 300 + (level - 1) * 55 + owned * 30 + (bonus.defense || 0);
  const speed = 100 + Math.min(60, (level - 1) * 2) + xpBoost * 3 + (bonus.speed || 0);
  const crit = Math.min(60, 5 + luck * 3 + Math.floor(level / 5) + (bonus.crit || 0));
  const critDamage = 150 + xpBoost * 8 + (bonus.critDamage || 0);
  const itemPower = equipped ? Math.round(equipped.basePower * (1 + (itemLevel - 1) * 0.18)) : 0;
  return Math.round(hp * 0.45 + attack * 2.2 + defense * 1.25 + speed * 5 + crit * 45 + critDamage * 8 + itemPower);
}

async function pveFight(user, payload) {
  const enemyId = String(payload.enemy_id || '');
  const enemy = pveEnemies[enemyId];
  if (!enemy) throw new Error('Invalid PvE enemy');
  const uid = Number(user.id);
  const [players, inventory] = await Promise.all([
    supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,level,xp,equipped_id,upgrades,blocked` }),
    supabase('inventory', { query: `?player_id=eq.${uid}&count=gt.0&select=item_id,count` })
  ]);
  const player = players?.[0];
  if (!player) throw new Error('Player not found');
  if (player.blocked) throw new Error('Account is blocked');
  const heroPower = calculateHeroPower(player, inventory || []);
  const chance = Math.max(0.08, Math.min(0.92, 0.5 + (heroPower - enemy.power) / (enemy.power * 2)));
  const victory = crypto.randomInt(1000000) < Math.floor(chance * 1000000);
  const reward = victory ? crypto.randomInt(enemy.reward[0], enemy.reward[1] + 1) : 0;
  const xpReward = victory ? enemy.xp : 10;
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const pve = upgrades.pve && typeof upgrades.pve === 'object' ? upgrades.pve : {};
  const nextUpgrades = { ...upgrades, pve: { battles: (Number(pve.battles) || 0) + 1, wins: (Number(pve.wins) || 0) + (victory ? 1 : 0), lastEnemy: enemyId } };
  const balance = Number(player.balance) || 0;
  const xp = Number(player.xp) || 0;
  const updated = await supabase('players', {
    method: 'PATCH',
    query: `?telegram_id=eq.${uid}&balance=eq.${balance}&xp=eq.${xp}`,
    body: { balance: balance + reward, xp: xp + xpReward, upgrades: nextUpgrades }
  });
  if (!updated?.length) throw new Error('Profile changed, try again');
  await rpc('apply_player_levels', { p_id: uid });
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { enemy_id: enemyId, victory, hero_power: heroPower, enemy_power: enemy.power, reward, xp: xpReward };
  return snapshot;
}

async function upgradeItem(user, payload) {
  const itemId = String(payload.item_id || '');
  if (!itemUpgradeBase[itemId]) throw new Error('Invalid item');
  const uid = Number(user.id);
  const [players, inventory] = await Promise.all([
    supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,upgrades` }),
    supabase('inventory', { query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(itemId)}&count=gt.0&select=count` })
  ]);
  const player = players?.[0];
  if (!player || !inventory?.[0]) throw new Error('Item not owned');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const itemLevels = upgrades.itemLevels && typeof upgrades.itemLevels === 'object' ? upgrades.itemLevels : {};
  const level = Math.max(1, Number(itemLevels[itemId]) || 1);
  if (level >= 10) throw new Error('Максимальный уровень предмета');
  const cost = itemUpgradeBase[itemId] * (level + 1);
  const balance = Number(player.balance) || 0;
  const materialCost = level < 3 ? 0 : level < 6 ? 1 : level < 9 ? 2 : 3;
  const inventoryCount = Number(inventory[0].count) || 0;
  if (balance < cost) throw new Error('Недостаточно Blox Coins');
  if (inventoryCount < materialCost + 1) throw new Error(`Нужно дубликатов: ${materialCost}`);
  const nextUpgrades = { ...upgrades, itemLevels: { ...itemLevels, [itemId]: level + 1 } };
  if (materialCost) {
    const materialUpdate = await supabase('inventory', {
      method: 'PATCH',
      query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(itemId)}&count=eq.${inventoryCount}`,
      body: { count: inventoryCount - materialCost }
    });
    if (!materialUpdate?.length) throw new Error('Inventory changed, try again');
  }
  const updated = await supabase('players', {
    method: 'PATCH',
    query: `?telegram_id=eq.${uid}&balance=eq.${balance}`,
    body: { balance: balance - cost, upgrades: nextUpgrades }
  });
  if (!updated?.length) {
    if (materialCost) await supabase('inventory', {
      method: 'PATCH',
      query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(itemId)}&count=eq.${inventoryCount - materialCost}`,
      body: { count: inventoryCount }
    }).catch(() => {});
    throw new Error('Profile changed, try again');
  }
  return rpc('player_snapshot', { p_id: uid });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST required' });
  try {
    const user = verifyTelegram(req.headers['x-telegram-init-data']);
    const body = await readBody(req);
    const action = String(body.action || 'bootstrap');
    const allowed = new Set(['bootstrap', 'spin', 'pve_fight', 'claim_daily', 'claim_mission', 'buy_upgrade', 'upgrade_item', 'item_action', 'claim_achievement', 'claim_league', 'rescue', 'open_chest', 'claim_season', 'claim_weekly', 'redeem_promo', 'referral_info', 'tournament_join']);
    if (!allowed.has(action)) return json(res, 400, { ok: false, error: 'Unknown action' });
    if (action === 'upgrade_item') {
      const payload = await upgradeItem(user, body.payload || {});
      if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action === 'pve_fight') {
      const payload = await pveFight(user, body.payload || {});
      if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    let payload = await rpc(action === 'bootstrap' ? 'bootstrap_player' : 'game_action', action === 'bootstrap' ? {
      p_user: publicUser(user),
      p_start_param: body.start_param || '',
      p_is_owner: isOwner(user)
    } : {
      p_telegram_id: Number(user.id),
      p_action: action,
      p_payload: body.payload || {},
      p_is_owner: isOwner(user)
    });
    if (action === 'spin') payload = await normalizeSpinDrop(user, payload);
    if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
    return json(res, 200, { ok: true, data: payload });
  } catch (error) {
    const status = /signature|session|authorization|user is missing/i.test(error.message) ? 401 : /not configured/i.test(error.message) ? 503 : 400;
    return json(res, status, { ok: false, error: error.message });
  }
};
