const crypto = require('crypto');
const { json, readBody, verifyTelegram, isOwner, supabase, rpc, publicUser } = require('./_lib');

const itemUpgradeBase = { block: 50, sword: 150, pet: 400, crystal: 900, crown: 2000, secret: 5000 };
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
    const allowed = new Set(['bootstrap', 'spin', 'claim_daily', 'claim_mission', 'buy_upgrade', 'upgrade_item', 'item_action', 'claim_achievement', 'claim_league', 'rescue', 'open_chest', 'claim_season', 'claim_weekly', 'redeem_promo', 'referral_info', 'tournament_join']);
    if (!allowed.has(action)) return json(res, 400, { ok: false, error: 'Unknown action' });
    if (action === 'upgrade_item') {
      const payload = await upgradeItem(user, body.payload || {});
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
