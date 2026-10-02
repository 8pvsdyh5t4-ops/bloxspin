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
const setItemIds = ['sword', 'block', 'pet', 'crystal', 'crown'];
const shopOffers = {
  starter_weapon: { itemId: 'sword', count: 1, price: 80000 },
  cyber_armor: { itemId: 'block', count: 1, price: 55000 },
  dragon_egg: { itemId: 'pet', count: 1, price: 180000 },
  void_aura: { itemId: 'crystal', count: 1, price: 320000 },
  royal_crown: { itemId: 'crown', count: 1, price: 750000 },
  evolution_pack: { itemId: 'sword', count: 2, price: 140000 },
  seasonal_aura: { itemId: 'crystal', count: 2, price: 480000, seasonal: true }
};
const starProducts = {
  neon_frame: { title: 'Неоновая рамка', description: 'Постоянная фиолетово-голубая рамка профиля.', stars: 75, grants: { frame: 'neon' } },
  victory_burst: { title: 'Эффект победы', description: 'Постоянная призматическая вспышка после победы.', stars: 90, grants: { effect: 'prism' } },
  void_trail: { title: 'След Пустоты', description: 'Постоянный косметический след для героя.', stars: 120, grants: { trail: 'void' } },
  cyber_royal_skin: { title: 'Cyber Royal', description: 'Постоянный эксклюзивный скин героя.', stars: 250, grants: { skin: 'cyber_royal' } },
  founder_pack: { title: 'Founder Pack', description: 'Рамка, золотой след, скин и эффект короны.', stars: 450, grants: { frame: 'founder', trail: 'gold', skin: 'founder', effect: 'crown' } }
};
const pveEnemies = {
  tank: { name: 'Железный танк', type: 'tank', power: 2600, reward: [200, 650], xp: 50 },
  assassin: { name: 'Теневой клинок', type: 'assassin', power: 4200, reward: [450, 1100], xp: 75 },
  mage: { name: 'Маг Пустоты', type: 'mage', power: 6000, reward: [800, 1800], xp: 110 },
  summoner: { name: 'Призыватель дронов', type: 'summoner', power: 8200, reward: [1300, 3000], xp: 150 },
  golem: { name: 'Инферно Голем', type: 'boss', power: 12000, reward: [2500, 10000], xp: 250 }
};
const bossEnemies = {
  inferno: { id: 'inferno', name: 'Инферно Голем', type: 'boss', power: 12000, reward: [3000, 11000], xp: 300, phases: ['Каменная броня', 'Вулканическая ярость', 'Огненный апокалипсис'], dropChance: 22, dropId: 'crystal' },
  seasonal: { id: 'seasonal', name: 'Кибер-Дракон', type: 'boss', power: 15500, reward: [5000, 16000], xp: 450, phases: ['Плазменный щит', 'Рой дронов', 'Квантовый шторм'], dropChance: 35, dropId: 'crown', seasonal: true }
};
const pvpBots = [
  { id: 'bot_shadow', telegram_id: 0, display_name: 'ShadowKing', photo_url: '', level: 8, equipped_id: 'sword', upgrades: { luck: 1, xp: 1, itemLevels: { sword: 3 } }, powerScale: 0.9 },
  { id: 'bot_cyber', telegram_id: 0, display_name: 'CyberNinja', photo_url: '', level: 12, equipped_id: 'crystal', upgrades: { luck: 2, xp: 2, itemLevels: { crystal: 2 } }, powerScale: 1.02 },
  { id: 'bot_master', telegram_id: 0, display_name: 'BloxMaster', photo_url: '', level: 16, equipped_id: 'crown', upgrades: { luck: 3, xp: 2, itemLevels: { crown: 3 } }, powerScale: 1.14 }
];
const pvpLeagues = [
  { id: 'Bronze', min: 0, reward: 500 }, { id: 'Silver', min: 1100, reward: 1200 },
  { id: 'Gold', min: 1300, reward: 2500 }, { id: 'Diamond', min: 1500, reward: 5000 },
  { id: 'Master', min: 1750, reward: 9000 }, { id: 'Legend', min: 2100, reward: 16000 }
];
const pvpLeague = rating => [...pvpLeagues].reverse().find(tier => Number(rating) >= tier.min) || pvpLeagues[0];
const pvpRating = upgrades => Math.max(0, Number(upgrades?.pvp?.rating) || 1000);
const pvpBounty = upgrades => {
  const streak = Math.max(0, Number(upgrades?.pvp?.streak) || 0);
  return streak >= 3 ? Math.min(5000, streak * 500) : 0;
};
function petProfile(upgrades, inventory) {
  const owned = inventory.some(row => row.item_id === 'pet' && Number(row.count) > 0);
  const level = owned ? Math.max(1, Math.min(10, Number(upgrades?.pet?.level) || Number(upgrades?.itemLevels?.pet) || 1)) : 0;
  const rarity = level >= 10 ? 'Secret' : level >= 7 ? 'Legendary' : level >= 4 ? 'Mythic' : 'Epic';
  return { owned, level, rarity, ability: 'Плазменный укус', damageBonus: level ? 12 + level * 6 : 0, attack: level * 35, speed: level * 2 };
}
const rollDropId = () => {
  const roll = crypto.randomInt(10000);
  if (roll < 6800) return 'block';
  if (roll < 9200) return 'sword';
  if (roll < 9850) return 'pet';
  if (roll < 9970) return 'crystal';
  if (roll < 9998) return 'crown';
  return 'secret';
};

async function telegramApi(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram payments are not configured');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || 'Telegram payment error');
  return result.result;
}

const webhookSecret = () => crypto.createHash('sha256').update(`${process.env.TELEGRAM_BOT_TOKEN || ''}:bloxspin-stars`).digest('hex');

async function ensurePaymentWebhook(req) {
  const publicAppUrl = String(process.env.PUBLIC_APP_URL || 'https://bloxspin-alpha.vercel.app').replace(/\/$/, '');
  const url = `${publicAppUrl}/api/telegram`;
  const info = await telegramApi('getWebhookInfo', {});
  if (info?.url && info.url !== url) throw new Error('Telegram webhook is managed by another service');
  await telegramApi('setWebhook', { url, secret_token: webhookSecret(), allowed_updates: ['pre_checkout_query', 'message'], drop_pending_updates: false });
}

async function economySummary(uid) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const rows = await supabase('economy_ledger', { query: `?player_id=eq.${uid}&created_at=gte.${encodeURIComponent(start.toISOString())}&select=amount,currency,event_type&limit=5000` });
  let earned = 0, spent = 0, stars = 0;
  for (const row of rows || []) {
    const amount = Number(row.amount) || 0;
    if (row.currency === 'stars') stars += Math.abs(amount);
    else if (amount > 0) earned += amount;
    else spent += Math.abs(amount);
  }
  return { earned, spent, stars, targetMin: 30000, targetMax: 70000, net: earned - spent };
}

async function attachEconomy(snapshot, uid) {
  if (snapshot && typeof snapshot === 'object') snapshot.economy = await economySummary(uid).catch(() => ({ earned: 0, spent: 0, stars: 0, targetMin: 30000, targetMax: 70000, net: 0 }));
  return snapshot;
}

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

function calculateHeroStats(player, inventory) {
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const itemLevels = upgrades.itemLevels && typeof upgrades.itemLevels === 'object' ? upgrades.itemLevels : {};
  const level = Math.max(1, Number(player.level) || 1);
  const owned = inventory.filter(row => Number(row.count) > 0).length;
  const equippedId = inventory.some(row => row.item_id === player.equipped_id && Number(row.count) > 0) ? player.equipped_id : '';
  const equipped = combatItems[equippedId];
  const itemLevel = Math.max(1, Math.min(10, Number(itemLevels[equippedId]) || 1));
  const evolution = Math.max(0, Math.min(3, Number(upgrades?.evolutions?.[equippedId]) || 0));
  const scale = (1 + (itemLevel - 1) * 0.15) * (1 + evolution * 0.35);
  const bonus = Object.fromEntries(Object.entries(equipped?.stats || {}).map(([key, value]) => [key, Math.round(value * scale)]));
  const luck = Number(upgrades.luck) || 0;
  const xpBoost = Number(upgrades.xp) || 0;
  const pet = petProfile(upgrades, inventory);
  const auraLevel = inventory.some(row => row.item_id === 'crystal' && Number(row.count) > 0) ? Math.max(1, Math.min(10, Number(upgrades?.aura?.level) || 1)) : 0;
  const setParts = setItemIds.filter(id => inventory.some(row => row.item_id === id && Number(row.count) > 0)).length;
  const setHp = setParts >= 4 ? 400 : 0;
  const setAttack = setParts >= 2 ? 100 : 0;
  const setDefense = setParts >= 3 ? 140 : 0;
  const hp = 1200 + (level - 1) * 200 + owned * 40 + (bonus.hp || 0) + setHp;
  const attack = 420 + (level - 1) * 80 + luck * 25 + (bonus.attack || 0) + pet.attack + auraLevel * 30 + setAttack;
  const defense = 300 + (level - 1) * 55 + owned * 30 + (bonus.defense || 0) + auraLevel * 25 + setDefense;
  const speed = 100 + Math.min(60, (level - 1) * 2) + xpBoost * 3 + (bonus.speed || 0) + pet.speed;
  const crit = Math.min(60, 5 + luck * 3 + Math.floor(level / 5) + (bonus.crit || 0) + Math.floor(auraLevel / 2) + (setParts >= 5 ? 5 : 0));
  const critDamage = 150 + xpBoost * 8 + (bonus.critDamage || 0);
  const itemPower = equipped ? Math.round(equipped.basePower * (1 + (itemLevel - 1) * 0.18) * (1 + evolution * 0.4)) : 0;
  const power = Math.round(hp * 0.45 + attack * 2.2 + defense * 1.25 + speed * 5 + crit * 45 + critDamage * 8 + itemPower);
  return { hp, attack, defense, speed, crit, critDamage, power, petLevel: pet.level, petDamageBonus: pet.damageBonus, auraLevel, setParts, evolution };
}

const calculateHeroPower = (player, inventory) => calculateHeroStats(player, inventory).power;

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
  if (victory) await rpc('increment_daily_progress', { p_id: uid, p_field: 'bot_wins', p_amount: 1 });
  await rpc('apply_player_levels', { p_id: uid });
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { enemy_id: enemyId, victory, hero_power: heroPower, enemy_power: enemy.power, reward, xp: xpReward };
  return snapshot;
}

function towerEnemy(floor) {
  const isBoss = floor % 10 === 0;
  const isMiniBoss = !isBoss && floor % 5 === 0;
  const rotation = ['tank', 'assassin', 'mage', 'summoner'];
  const type = isBoss ? 'boss' : isMiniBoss ? 'tank' : rotation[(floor - 1) % rotation.length];
  const names = { tank: 'Страж башни', assassin: 'Ночной охотник', mage: 'Рунный маг', summoner: 'Хозяин дронов', boss: 'Владыка этажа' };
  const power = 700 + floor * 900;
  return { id: `tower_${floor}`, name: isBoss ? `${names.boss} ${floor}` : isMiniBoss ? `Мини-босс · этаж ${floor}` : `${names[type]} · этаж ${floor}`, type, power, reward: [300 + floor * 150, 550 + floor * 260], xp: 40 + floor * 12, floor, isBoss, isMiniBoss };
}

function createBattleState(hero, enemy, inventory, mode) {
  const modifiers = {
    tank: { hp: 1.3, attack: 0.85, defense: 1.55, speed: 80, crit: 5 },
    assassin: { hp: 0.76, attack: 1.16, defense: 0.7, speed: 155, crit: 30 },
    mage: { hp: 0.86, attack: 1.1, defense: 0.78, speed: 115, crit: 12 },
    summoner: { hp: 1, attack: 1, defense: 0.9, speed: 100, crit: 10 },
    boss: { hp: 1.42, attack: 1.2, defense: 1.22, speed: 105, crit: 18 }
  };
  const mod = modifiers[enemy.type] || modifiers.tank;
  const enemyHp = Math.round(enemy.power * 0.62 * mod.hp);
  return {
    mode,
    enemyId: enemy.id,
    enemyName: enemy.name,
    enemyType: enemy.type,
    enemyPower: enemy.power,
    heroPower: hero.power,
    heroHp: hero.hp,
    maxHeroHp: hero.hp,
    enemyHp,
    maxEnemyHp: enemyHp,
    heroStats: { attack: hero.attack, defense: hero.defense, speed: hero.speed, crit: hero.crit, critDamage: hero.critDamage },
    enemyStats: { attack: Math.round(enemy.power * 0.075 * mod.attack), defense: Math.round(enemy.power * 0.026 * mod.defense), speed: mod.speed, crit: mod.crit },
    turn: 1,
    skillCd: 0,
    petCd: 0,
    auraCd: 0,
    auraShield: 0,
    enemyGuard: 0,
    petReady: inventory.some(row => row.item_id === 'pet' && Number(row.count) > 0),
    auraReady: inventory.some(row => row.item_id === 'crystal' && Number(row.count) > 0),
    rewardMin: enemy.reward[0],
    rewardMax: enemy.reward[1],
    xpReward: enemy.xp,
    floor: enemy.floor || 0,
    isBoss: Boolean(enemy.isBoss),
    isMiniBoss: Boolean(enemy.isMiniBoss),
    phase: 1,
    phases: enemy.phases || [],
    dropChance: Number(enemy.dropChance) || 0,
    dropId: enemy.dropId || '',
    seasonal: Boolean(enemy.seasonal)
  };
}

async function battleStart(user, payload) {
  const uid = Number(user.id);
  const mode = ['tower', 'boss'].includes(payload.mode) ? payload.mode : 'pve';
  const [players, inventory] = await Promise.all([
    supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,level,xp,equipped_id,upgrades,blocked` }),
    supabase('inventory', { query: `?player_id=eq.${uid}&count=gt.0&select=item_id,count` })
  ]);
  const player = players?.[0];
  if (!player) throw new Error('Player not found');
  if (player.blocked) throw new Error('Account is blocked');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const tower = upgrades.tower && typeof upgrades.tower === 'object' ? upgrades.tower : { floor: 1, best: 0, wins: 0 };
  const enemyId = String(payload.enemy_id || '');
  const enemy = mode === 'tower' ? towerEnemy(Math.max(1, Number(tower.floor) || 1)) : mode === 'boss' ? bossEnemies[enemyId] : pveEnemies[enemyId] ? { ...pveEnemies[enemyId], id: enemyId } : null;
  if (!enemy) throw new Error('Invalid battle enemy');
  const battle = createBattleState(calculateHeroStats(player, inventory || []), enemy, inventory || [], mode);
  const updated = await supabase('players', {
    method: 'PATCH',
    query: `?telegram_id=eq.${uid}&balance=eq.${Number(player.balance) || 0}&xp=eq.${Number(player.xp) || 0}`,
    body: { upgrades: { ...upgrades, battle } }
  });
  if (!updated?.length) throw new Error('Profile changed, try again');
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: 'active', battle, log: [`${enemy.name} выходит на арену`] };
  return snapshot;
}

async function pvpTargets(user) {
  const uid = Number(user.id);
  const candidates = await supabase('players', { query: `?telegram_id=neq.${uid}&blocked=eq.false&select=telegram_id,display_name,photo_url,level,equipped_id,upgrades,last_seen&order=last_seen.desc&limit=12` });
  const targets = await Promise.all((candidates || []).map(async opponent => {
    const inventory = await supabase('inventory', { query: `?player_id=eq.${Number(opponent.telegram_id)}&count=gt.0&select=item_id,count` });
    const stats = calculateHeroStats(opponent, inventory || []);
    const rating = pvpRating(opponent.upgrades);
    return { id: String(opponent.telegram_id), name: opponent.display_name || 'Игрок', photo: opponent.photo_url || '', level: Number(opponent.level) || 1, equipment: opponent.equipped_id || '', power: stats.power, rating, league: pvpLeague(rating).id, streak: Number(opponent.upgrades?.pvp?.streak) || 0, bounty: pvpBounty(opponent.upgrades), online: Date.now() - new Date(opponent.last_seen || 0).getTime() < 120000 };
  }));
  if (targets.length < 3) {
    const ownRows = await supabase('players', { query: `?telegram_id=eq.${uid}&select=level,equipped_id,upgrades` });
    const ownInventory = await supabase('inventory', { query: `?player_id=eq.${uid}&count=gt.0&select=item_id,count` });
    const ownPower = calculateHeroPower(ownRows?.[0] || { level: 1, upgrades: {} }, ownInventory || []);
    for (const bot of pvpBots.slice(0, 3 - targets.length)) targets.push({ id: bot.id, name: bot.display_name, photo: '', level: bot.level, equipment: bot.equipped_id, power: Math.round(ownPower * bot.powerScale), rating: 1000, league: 'Bronze', streak: 0, bounty: 0, online: false, training: true });
  }
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: 'targets', targets };
  return snapshot;
}

async function pvpMatch(user, payload = {}) {
  const uid = Number(user.id);
  const [players, inventory, candidates] = await Promise.all([
    supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,level,xp,equipped_id,upgrades,blocked` }),
    supabase('inventory', { query: `?player_id=eq.${uid}&count=gt.0&select=item_id,count` }),
    supabase('players', { query: `?telegram_id=neq.${uid}&blocked=eq.false&select=telegram_id,display_name,photo_url,level,equipped_id,upgrades,last_seen&limit=20` })
  ]);
  const player = players?.[0];
  if (!player) throw new Error('Player not found');
  if (player.blocked) throw new Error('Account is blocked');
  const hero = calculateHeroStats(player, inventory || []);
  const selectedKey = String(payload.opponent_id || '');
  const selectedId = Number(selectedKey) || 0;
  let selectedBot = selectedKey.startsWith('bot_') ? pvpBots.find(bot => bot.id === selectedKey) : null;
  let opponent = selectedBot || (selectedId ? (candidates || []).find(candidate => Number(candidate.telegram_id) === selectedId) : [...(candidates || [])].sort((a, b) => Math.abs(Number(a.level) - Number(player.level)) - Math.abs(Number(b.level) - Number(player.level)))[0]);
  if (selectedKey && !opponent) throw new Error('Opponent is unavailable');
  let opponentInventory = [];
  if (selectedBot) {
    opponentInventory = [{ item_id: selectedBot.equipped_id, count: 1 }];
  } else if (opponent) {
    opponentInventory = await supabase('inventory', { query: `?player_id=eq.${Number(opponent.telegram_id)}&count=gt.0&select=item_id,count` });
  } else {
    selectedBot = pvpBots[0];
    opponent = selectedBot;
    opponentInventory = [{ item_id: selectedBot.equipped_id, count: 1 }];
  }
  const rival = calculateHeroStats(opponent, opponentInventory || []);
  if (selectedBot) rival.power = Math.round(hero.power * selectedBot.powerScale);
  const enemy = { id: `pvp_${opponent.telegram_id}`, name: opponent.display_name || 'Соперник', type: 'assassin', power: rival.power, reward: [700, 1800], xp: 120 };
  const battle = createBattleState(hero, enemy, inventory || [], 'pvp');
  Object.assign(battle, { opponentId: selectedBot?.id || String(opponent.telegram_id), opponentLevel: Number(opponent.level) || 1, opponentEquipment: opponent.equipped_id || '', opponentPhoto: opponent.photo_url || '', opponentOnline: selectedBot ? false : Date.now() - new Date(opponent.last_seen || 0).getTime() < 120000, opponentRating: pvpRating(opponent.upgrades), opponentLeague: pvpLeague(pvpRating(opponent.upgrades)).id, opponentBounty: selectedBot ? 0 : pvpBounty(opponent.upgrades), training: Boolean(selectedBot) });
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const updated = await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${Number(player.balance) || 0}&xp=eq.${Number(player.xp) || 0}`, body: { upgrades: { ...upgrades, battle } } });
  if (!updated?.length) throw new Error('Profile changed, try again');
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: 'matched', battle };
  return snapshot;
}

const randomDamage = value => Math.max(1, Math.round(value * (90 + crypto.randomInt(21)) / 100));

async function battleTurn(user, payload) {
  const uid = Number(user.id);
  const move = String(payload.move || 'attack');
  if (!['attack', 'skill', 'pet', 'aura'].includes(move)) throw new Error('Invalid battle move');
  const players = await supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,crystals,level,xp,upgrades,blocked` });
  const player = players?.[0];
  if (!player) throw new Error('Player not found');
  if (player.blocked) throw new Error('Account is blocked');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const battle = upgrades.battle && typeof upgrades.battle === 'object' ? { ...upgrades.battle, heroStats: { ...upgrades.battle.heroStats }, enemyStats: { ...upgrades.battle.enemyStats } } : null;
  if (!battle || !battle.enemyId || battle.heroHp <= 0 || battle.enemyHp <= 0) throw new Error('No active battle');
  if (move === 'skill' && battle.skillCd > 0) throw new Error('Навык ещё восстанавливается');
  if (move === 'pet' && (!battle.petReady || battle.petCd > 0)) throw new Error('Питомец сейчас недоступен');
  if (move === 'aura' && (!battle.auraReady || battle.auraCd > 0)) throw new Error('Аура сейчас недоступна');
  const log = [];
  let multiplier = 1;
  if (move === 'skill') { multiplier = 1.75; battle.skillCd = 3; log.push('Ты используешь Неоновый разрез'); }
  if (move === 'pet') { multiplier = 0.75 + Number(battle.heroStats.petDamageBonus || 0) / 100; battle.petCd = 3; log.push(`Питомец применяет Плазменный укус ур. ${Number(battle.heroStats.petLevel) || 1}`); }
  if (move === 'aura') { battle.auraShield = 0.55; battle.auraCd = 4; log.push('Аура поглощает 55% следующего урона'); }
  if (move !== 'aura') {
    const crit = crypto.randomInt(100) < Number(battle.heroStats.crit || 0);
    if (crit) multiplier *= Number(battle.heroStats.critDamage || 150) / 100;
    let damage = randomDamage(Number(battle.heroStats.attack) * multiplier - Number(battle.enemyStats.defense) * 0.35);
    if (battle.enemyGuard) { damage = Math.max(1, Math.round(damage * (1 - battle.enemyGuard))); battle.enemyGuard = 0; }
    battle.enemyHp = Math.max(0, Number(battle.enemyHp) - damage);
    log.push(`${crit ? 'Критический удар' : 'Твой удар'}: −${damage} HP`);
  }
  if (battle.phases?.length && battle.enemyHp > 0) {
    const ratio = battle.enemyHp / battle.maxEnemyHp;
    const phase = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
    if (phase > Number(battle.phase || 1)) {
      battle.phase = phase;
      log.push(`Фаза ${phase}: ${battle.phases[phase - 1]}`);
    }
  }
  if (battle.enemyHp > 0) {
    let enemyMultiplier = 1;
    let defenseFactor = 0.35;
    let enemyCrit = crypto.randomInt(100) < Number(battle.enemyStats.crit || 0);
    if (battle.enemyType === 'tank' && battle.turn % 3 === 0) { battle.enemyGuard = 0.5; log.push('Танк включает Стену щитов'); enemyMultiplier = 0.7; }
    if (battle.enemyType === 'assassin' && enemyCrit) { enemyMultiplier = 1.8; log.push('Ассасин наносит удар из тени'); }
    if (battle.enemyType === 'mage' && battle.turn % 3 === 0) { enemyMultiplier = 1.55; defenseFactor = 0.14; log.push('Маг выпускает Взрыв Пустоты'); }
    if (battle.enemyType === 'summoner' && battle.turn % 3 === 0) { enemyMultiplier = 1.35; log.push('Призыватель вызывает боевых дронов'); }
    if (battle.enemyType === 'boss' && (battle.turn % 4 === 0 || Number(battle.phase) > 1)) { enemyMultiplier = 1.35 + Number(battle.phase || 1) * 0.22; defenseFactor = 0.2; log.push(`Босс применяет: ${battle.phases?.[Number(battle.phase || 1) - 1] || 'Огненный метеор'}`); }
    let enemyDamage = randomDamage(Math.max(Number(battle.enemyStats.attack) * 0.25, Number(battle.enemyStats.attack) * enemyMultiplier - Number(battle.heroStats.defense) * defenseFactor));
    if (battle.auraShield) { enemyDamage = Math.max(1, Math.round(enemyDamage * (1 - battle.auraShield))); battle.auraShield = 0; log.push('Аура смягчает удар'); }
    battle.heroHp = Math.max(0, Number(battle.heroHp) - enemyDamage);
    log.push(`Ответ ${battle.enemyName}: −${enemyDamage} HP`);
  }
  battle.skillCd = Math.max(0, Number(battle.skillCd) - 1);
  battle.petCd = Math.max(0, Number(battle.petCd) - 1);
  battle.auraCd = Math.max(0, Number(battle.auraCd) - 1);
  battle.turn = Number(battle.turn) + 1;
  const victory = battle.enemyHp <= 0;
  const defeat = battle.heroHp <= 0;
  const balance = Number(player.balance) || 0;
  const xp = Number(player.xp) || 0;
  let reward = 0;
  let xpReward = 0;
  let crystalReward = 0;
  let drop = '';
  let nextUpgrades = { ...upgrades, battle };
  if (victory || defeat) {
    const pve = upgrades.pve && typeof upgrades.pve === 'object' ? upgrades.pve : {};
    const tower = upgrades.tower && typeof upgrades.tower === 'object' ? upgrades.tower : { floor: 1, best: 0, wins: 0 };
    reward = victory ? crypto.randomInt(Number(battle.rewardMin), Number(battle.rewardMax) + 1) : 0;
    if (victory && battle.mode === 'pvp') reward += Number(battle.opponentBounty) || 0;
    xpReward = victory ? Number(battle.xpReward) : 10;
    nextUpgrades = { ...upgrades };
    delete nextUpgrades.battle;
    if (battle.mode === 'tower') nextUpgrades.tower = { floor: victory ? Number(battle.floor) + 1 : Number(battle.floor), best: Math.max(Number(tower.best) || 0, victory ? Number(battle.floor) : 0), wins: (Number(tower.wins) || 0) + (victory ? 1 : 0) };
    else if (battle.mode === 'pvp') {
      const pvp = upgrades.pvp && typeof upgrades.pvp === 'object' ? upgrades.pvp : {};
      const rating = Math.max(0, (Number(pvp.rating) || 1000) + (victory ? 25 : -18));
      nextUpgrades.pvp = { ...pvp, matches: (Number(pvp.matches) || 0) + 1, wins: (Number(pvp.wins) || 0) + (victory ? 1 : 0), losses: (Number(pvp.losses) || 0) + (defeat ? 1 : 0), streak: victory ? (Number(pvp.streak) || 0) + 1 : 0, bestStreak: Math.max(Number(pvp.bestStreak) || 0, victory ? (Number(pvp.streak) || 0) + 1 : 0), rating, league: pvpLeague(rating).id };
    } else nextUpgrades.pve = { battles: (Number(pve.battles) || 0) + 1, wins: (Number(pve.wins) || 0) + (victory ? 1 : 0), lastEnemy: battle.enemyId };
    if (battle.mode === 'boss') {
      const bosses = upgrades.bosses && typeof upgrades.bosses === 'object' ? upgrades.bosses : {};
      nextUpgrades.bosses = { wins: (Number(bosses.wins) || 0) + (victory ? 1 : 0), seasonalWins: (Number(bosses.seasonalWins) || 0) + (victory && battle.seasonal ? 1 : 0), lastBoss: battle.enemyId };
      if (victory && battle.dropId && crypto.randomInt(100) < Number(battle.dropChance || 0)) drop = battle.dropId;
      crystalReward = victory ? (battle.seasonal ? 5 : 2) : 0;
    }
  }
  const updated = await supabase('players', {
    method: 'PATCH',
    query: `?telegram_id=eq.${uid}&balance=eq.${balance}&crystals=eq.${Number(player.crystals || 0)}&xp=eq.${xp}`,
    body: { balance: balance + reward, crystals: Number(player.crystals || 0) + crystalReward, xp: xp + xpReward, upgrades: nextUpgrades }
  });
  if (!updated?.length) throw new Error('Profile changed, try again');
  if (drop) {
    const rows = await supabase('inventory', { query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(drop)}&select=count` });
    const count = Number(rows?.[0]?.count) || 0;
    await supabase('inventory', { method: 'POST', query: '?on_conflict=player_id,item_id', prefer: 'resolution=merge-duplicates,return=representation', body: { player_id: uid, item_id: drop, count: count + 1, discovered: true } }).catch(() => { drop = ''; });
  }
  if (victory) await rpc('increment_daily_progress', { p_id: uid, p_field: battle.mode === 'tower' ? 'tower_floors' : battle.mode === 'pvp' ? 'pvp_wins' : 'bot_wins', p_amount: 1 });
  if (victory || defeat) await rpc('apply_player_levels', { p_id: uid });
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: victory ? 'victory' : defeat ? 'defeat' : 'active', battle: victory || defeat ? null : battle, finishedBattle: victory || defeat ? battle : null, log, reward, xp: xpReward, crystals: crystalReward, drop };
  return snapshot;
}

const onlineMatchView = (row, uid) => {
  if (!row) return null;
  const state = row.state || {};
  const me = state.players?.[String(uid)] || {};
  const opponentId = Number(row.player_one) === uid ? Number(row.player_two) : Number(row.player_one);
  const opponent = state.players?.[String(opponentId)] || {};
  return { id: row.id, status: row.status, version: Number(row.version) || 1, turn: Number(state.turn), isMyTurn: Number(state.turn) === uid, winnerId: row.winner_id ? Number(row.winner_id) : 0, me, opponent: { ...opponent, id: opponentId }, log: state.log || [], reward: Number(state.rewards?.[String(uid)]) || 0, ratingChange: Number(state.ratingChanges?.[String(uid)]) || 0 };
};

async function updateOnlinePvpPlayer(playerId, victory, reward) {
  const rows = await supabase('players', { query: `?telegram_id=eq.${playerId}&select=balance,xp,upgrades` });
  const player = rows?.[0];
  if (!player) return;
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const old = upgrades.pvp && typeof upgrades.pvp === 'object' ? upgrades.pvp : {};
  const ratingChange = victory ? 30 : -20;
  const rating = Math.max(0, (Number(old.rating) || 1000) + ratingChange);
  const pvp = { ...old, matches: (Number(old.matches) || 0) + 1, wins: (Number(old.wins) || 0) + (victory ? 1 : 0), losses: (Number(old.losses) || 0) + (victory ? 0 : 1), streak: victory ? (Number(old.streak) || 0) + 1 : 0, bestStreak: Math.max(Number(old.bestStreak) || 0, victory ? (Number(old.streak) || 0) + 1 : 0), rating, league: pvpLeague(rating).id };
  await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${playerId}&balance=eq.${Number(player.balance) || 0}&xp=eq.${Number(player.xp) || 0}`, body: { balance: Number(player.balance) + reward, xp: Number(player.xp) + (victory ? 160 : 45), upgrades: { ...upgrades, pvp } } });
  await rpc('apply_player_levels', { p_id: playerId });
  if (victory) await rpc('increment_daily_progress', { p_id: playerId, p_field: 'pvp_wins', p_amount: 1 });
  return ratingChange;
}

async function onlinePvp(user, payload = {}) {
  const uid = Number(user.id);
  const command = String(payload.command || 'status');
  if (!['join', 'status', 'turn', 'cancel'].includes(command)) throw new Error('Invalid online PvP command');
  const activeRows = await supabase('pvp_matches', { query: `?or=(player_one.eq.${uid},player_two.eq.${uid})&status=eq.active&select=id,player_one,player_two,state,status,winner_id,version,updated_at&order=updated_at.desc&limit=1` });
  let match = activeRows?.[0];
  if (command === 'cancel') {
    await supabase('pvp_queue', { method: 'DELETE', query: `?player_id=eq.${uid}` });
    const snapshot = await rpc('player_snapshot', { p_id: uid });
    snapshot.event = { status: 'cancelled', onlineMatch: match ? onlineMatchView(match, uid) : null };
    return snapshot;
  }
  if (command === 'turn') {
    if (!match || match.id !== String(payload.match_id || '')) throw new Error('Онлайн-матч не найден');
    const move = String(payload.move || 'attack');
    if (!['attack', 'skill', 'pet'].includes(move)) throw new Error('Invalid online move');
    const state = structuredClone(match.state || {});
    if (Number(state.turn) !== uid) throw new Error('Сейчас ход соперника');
    const opponentId = Number(match.player_one) === uid ? Number(match.player_two) : Number(match.player_one);
    const hero = state.players?.[String(uid)];
    const enemy = state.players?.[String(opponentId)];
    if (!hero || !enemy) throw new Error('Данные матча повреждены');
    if (move === 'pet' && !hero.petLevel) throw new Error('Питомец не найден');
    const multiplier = move === 'skill' ? 1.55 : move === 'pet' ? 0.8 + Number(hero.petDamageBonus || 0) / 100 : 1;
    const crit = crypto.randomInt(100) < Number(hero.crit || 0);
    const damage = randomDamage(Math.max(Number(hero.attack) * 0.25, Number(hero.attack) * multiplier * (crit ? Number(hero.critDamage || 150) / 100 : 1) - Number(enemy.defense) * 0.35));
    enemy.hp = Math.max(0, Number(enemy.hp) - damage);
    state.log = [...(state.log || []), `${hero.name}: ${move === 'pet' ? 'питомец' : move === 'skill' ? 'навык' : 'атака'} −${damage} HP`].slice(-8);
    const finished = enemy.hp <= 0;
    state.turn = opponentId;
    if (finished) {
      const bounty = Number(enemy.bounty) || 0;
      state.rewards = { [String(uid)]: 1200 + bounty, [String(opponentId)]: 0 };
      state.ratingChanges = { [String(uid)]: 30, [String(opponentId)]: -20 };
    }
    const updated = await supabase('pvp_matches', { method: 'PATCH', query: `?id=eq.${match.id}&status=eq.active&version=eq.${Number(match.version) || 1}`, body: { state, status: finished ? 'finished' : 'active', winner_id: finished ? uid : null, version: (Number(match.version) || 1) + 1, updated_at: new Date().toISOString() } });
    if (!updated?.length) throw new Error('Ход уже изменился, обнови матч');
    match = updated[0];
    if (finished) {
      await Promise.all([updateOnlinePvpPlayer(uid, true, Number(state.rewards[String(uid)])), updateOnlinePvpPlayer(opponentId, false, 0)]);
    }
  } else if (!match && command === 'join') {
    const [players, inventory] = await Promise.all([
      supabase('players', { query: `?telegram_id=eq.${uid}&select=telegram_id,display_name,photo_url,level,equipped_id,upgrades,blocked` }),
      supabase('inventory', { query: `?player_id=eq.${uid}&count=gt.0&select=item_id,count` })
    ]);
    const player = players?.[0];
    if (!player || player.blocked) throw new Error('Игрок недоступен');
    const stats = calculateHeroStats(player, inventory || []);
    const rating = pvpRating(player.upgrades);
    const snapshot = { id: uid, name: player.display_name || 'Игрок', photo: player.photo_url || '', level: Number(player.level) || 1, equipment: player.equipped_id || '', rating, league: pvpLeague(rating).id, bounty: pvpBounty(player.upgrades), ...stats, hp: stats.hp, maxHp: stats.hp };
    const cutoff = new Date(Date.now() - 90000).toISOString();
    const waiting = await supabase('pvp_queue', { query: `?player_id=neq.${uid}&last_seen=gte.${encodeURIComponent(cutoff)}&select=player_id,rating,power,snapshot,joined_at&order=joined_at.asc&limit=1` });
    const opponent = waiting?.[0];
    if (opponent) {
      const opponentSnapshot = opponent.snapshot || {};
      const firstTurn = crypto.randomInt(2) ? uid : Number(opponent.player_id);
      const state = { turn: firstTurn, players: { [String(uid)]: snapshot, [String(opponent.player_id)]: opponentSnapshot }, log: ['Соперник найден. Онлайн-бой начался.'] };
      const created = await supabase('pvp_matches', { method: 'POST', body: { player_one: Number(opponent.player_id), player_two: uid, state, status: 'active', version: 1 } });
      match = created?.[0];
      await supabase('pvp_queue', { method: 'DELETE', query: `?player_id=in.(${uid},${Number(opponent.player_id)})` });
    } else {
      await supabase('pvp_queue', { method: 'POST', query: '?on_conflict=player_id', prefer: 'resolution=merge-duplicates,return=representation', body: { player_id: uid, rating, power: stats.power, snapshot, joined_at: new Date().toISOString(), last_seen: new Date().toISOString() } });
    }
  } else if (!match) {
    const queueRows = await supabase('pvp_queue', { query: `?player_id=eq.${uid}&select=player_id,last_seen` });
    if (queueRows?.length) await supabase('pvp_queue', { method: 'PATCH', query: `?player_id=eq.${uid}`, body: { last_seen: new Date().toISOString() } });
  }
  if (!match) {
    const finishedRows = await supabase('pvp_matches', { query: `?or=(player_one.eq.${uid},player_two.eq.${uid})&status=eq.finished&select=id,player_one,player_two,state,status,winner_id,version,updated_at&order=updated_at.desc&limit=1` });
    match = finishedRows?.[0];
  }
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: match ? match.status : command === 'join' ? 'waiting' : 'idle', onlineMatch: onlineMatchView(match, uid) };
  return snapshot;
}

async function petUpgrade(user) {
  const uid = Number(user.id);
  const [players, inventory] = await Promise.all([
    supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,upgrades` }),
    supabase('inventory', { query: `?player_id=eq.${uid}&item_id=eq.pet&count=gt.0&select=count` })
  ]);
  const player = players?.[0];
  if (!player || !inventory?.[0]) throw new Error('Сначала получи питомца в Spin');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const pet = petProfile(upgrades, [{ item_id: 'pet', count: Number(inventory[0].count) }]);
  if (pet.level >= 10) throw new Error('Питомец достиг максимального уровня');
  const cost = pet.level * 1200;
  if (Number(player.balance) < cost) throw new Error('Недостаточно Blox Coins');
  const updated = await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${Number(player.balance)}`, body: { balance: Number(player.balance) - cost, upgrades: { ...upgrades, pet: { level: pet.level + 1 } } } });
  if (!updated?.length) throw new Error('Профиль изменился, повтори попытку');
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: 'pet_upgraded', pet: petProfile({ ...upgrades, pet: { level: pet.level + 1 } }, [{ item_id: 'pet', count: Number(inventory[0].count) }]) };
  return snapshot;
}

async function claimPvpLeague(user) {
  const uid = Number(user.id);
  const rows = await supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,upgrades` });
  const player = rows?.[0];
  if (!player) throw new Error('Player not found');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const pvp = upgrades.pvp && typeof upgrades.pvp === 'object' ? upgrades.pvp : {};
  const season = new Date().toISOString().slice(0, 7);
  if (pvp.leagueClaimed === season) throw new Error('Награда лиги уже получена');
  const tier = pvpLeague(pvpRating(upgrades));
  const updated = await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${Number(player.balance)}`, body: { balance: Number(player.balance) + tier.reward, upgrades: { ...upgrades, pvp: { ...pvp, league: tier.id, leagueClaimed: season } } } });
  if (!updated?.length) throw new Error('Профиль изменился, повтори попытку');
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: 'league_reward', league: tier.id, reward: tier.reward };
  return snapshot;
}

async function survivorAction(user, payload, finish = false) {
  const uid = Number(user.id);
  const players = await supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,xp,upgrades,blocked` });
  const player = players?.[0];
  if (!player) throw new Error('Player not found');
  if (player.blocked) throw new Error('Account is blocked');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  if (!finish) {
    const survivorSession = { startedAt: Date.now(), nonce: crypto.randomBytes(8).toString('hex') };
    const updated = await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${Number(player.balance) || 0}`, body: { upgrades: { ...upgrades, survivorSession } } });
    if (!updated?.length) throw new Error('Profile changed, try again');
    const snapshot = await rpc('player_snapshot', { p_id: uid });
    snapshot.event = { status: 'started', nonce: survivorSession.nonce };
    return snapshot;
  }
  const session = upgrades.survivorSession;
  if (!session?.startedAt || session.nonce !== String(payload.nonce || '')) throw new Error('Survivor session is missing');
  const elapsed = Math.max(1, Math.min(180, Math.floor((Date.now() - Number(session.startedAt)) / 1000)));
  const seconds = Math.max(1, Math.min(elapsed + 3, Number(payload.seconds) || 1));
  const wave = Math.max(1, Math.min(Math.floor(seconds / 12) + 1, Number(payload.wave) || 1));
  const kills = Math.max(0, Math.min(wave * 14, Number(payload.kills) || 0));
  const reward = Math.floor(seconds * 4 + kills * 8 + wave * 75);
  const xpReward = Math.floor(seconds / 2 + wave * 12);
  const old = upgrades.survivor && typeof upgrades.survivor === 'object' ? upgrades.survivor : {};
  const nextUpgrades = { ...upgrades, survivor: { runs: (Number(old.runs) || 0) + 1, bestWave: Math.max(Number(old.bestWave) || 0, wave), bestTime: Math.max(Number(old.bestTime) || 0, seconds), totalKills: (Number(old.totalKills) || 0) + kills } };
  delete nextUpgrades.survivorSession;
  const updated = await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${Number(player.balance) || 0}&xp=eq.${Number(player.xp) || 0}`, body: { balance: Number(player.balance) + reward, xp: Number(player.xp) + xpReward, upgrades: nextUpgrades } });
  if (!updated?.length) throw new Error('Profile changed, try again');
  await rpc('apply_player_levels', { p_id: uid });
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: 'finished', seconds, wave, kills, reward, xp: xpReward };
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
  await rpc('increment_daily_progress', { p_id: uid, p_field: 'item_upgrades', p_amount: 1 });
  return rpc('player_snapshot', { p_id: uid });
}

async function auraUpgrade(user) {
  const uid = Number(user.id);
  const [players, inventory] = await Promise.all([
    supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,upgrades` }),
    supabase('inventory', { query: `?player_id=eq.${uid}&item_id=eq.crystal&count=gt.0&select=count` })
  ]);
  const player = players?.[0];
  if (!player || !inventory?.[0]) throw new Error('Сначала получи ауру Void Crystal');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const level = Math.max(1, Math.min(10, Number(upgrades?.aura?.level) || 1));
  if (level >= 10) throw new Error('Аура уже максимального уровня');
  const balance = Number(player.balance) || 0;
  const cost = level * 1200;
  if (balance < cost) throw new Error('Недостаточно Blox Coins');
  const nextUpgrades = { ...upgrades, aura: { ...(upgrades.aura || {}), level: level + 1 } };
  const updated = await supabase('players', {
    method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${balance}`,
    body: { balance: balance - cost, upgrades: nextUpgrades }
  });
  if (!updated?.length) throw new Error('Профиль изменился, повтори попытку');
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: 'aura_upgraded', level: level + 1 };
  return snapshot;
}

async function evolveItem(user, payload) {
  const itemId = String(payload.item_id || '');
  if (!combatItems[itemId]) throw new Error('Предмет нельзя эволюционировать');
  const uid = Number(user.id);
  const [players, rows] = await Promise.all([
    supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,upgrades` }),
    supabase('inventory', { query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(itemId)}&count=gt.0&select=count` })
  ]);
  const player = players?.[0], row = rows?.[0];
  if (!player || !row) throw new Error('Предмет не найден');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const evolutions = upgrades.evolutions && typeof upgrades.evolutions === 'object' ? upgrades.evolutions : {};
  const rank = Math.max(0, Math.min(3, Number(evolutions[itemId]) || 0));
  if (rank >= 3) throw new Error('Достигнута высшая эволюция');
  const duplicates = rank + 2;
  const count = Number(row.count) || 0;
  const cost = itemUpgradeBase[itemId] * (rank + 1) * 8;
  const balance = Number(player.balance) || 0;
  if (count < duplicates + 1) throw new Error(`Нужно дубликатов: ${duplicates}`);
  if (balance < cost) throw new Error('Недостаточно Blox Coins');
  const inventoryUpdate = await supabase('inventory', {
    method: 'PATCH', query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(itemId)}&count=eq.${count}`,
    body: { count: count - duplicates }
  });
  if (!inventoryUpdate?.length) throw new Error('Инвентарь изменился, повтори попытку');
  const nextUpgrades = { ...upgrades, evolutions: { ...evolutions, [itemId]: rank + 1 } };
  const updated = await supabase('players', {
    method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${balance}`,
    body: { balance: balance - cost, upgrades: nextUpgrades }
  });
  if (!updated?.length) {
    await supabase('inventory', { method: 'PATCH', query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(itemId)}&count=eq.${count - duplicates}`, body: { count } }).catch(() => {});
    throw new Error('Профиль изменился, повтори попытку');
  }
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: 'item_evolved', item_id: itemId, rank: rank + 1 };
  return snapshot;
}

async function shopBuy(user, payload) {
  const offerId = String(payload.offer_id || '');
  const offer = shopOffers[offerId];
  if (!offer) throw new Error('Предложение не найдено');
  const uid = Number(user.id);
  const [players, rows] = await Promise.all([
    supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,upgrades` }),
    supabase('inventory', { query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(offer.itemId)}&select=count` })
  ]);
  const player = players?.[0];
  if (!player) throw new Error('Профиль не найден');
  const balance = Number(player.balance) || 0;
  if (balance < offer.price) throw new Error('Недостаточно Blox Coins');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const purchases = upgrades.shopPurchases && typeof upgrades.shopPurchases === 'object' ? upgrades.shopPurchases : {};
  const seasonKey = new Date().toISOString().slice(0, 7);
  const purchaseKey = offer.seasonal ? `${offerId}_${seasonKey}` : '';
  if (purchaseKey && purchases[purchaseKey]) throw new Error('Сезонное предложение уже куплено');
  const nextUpgrades = purchaseKey ? { ...upgrades, shopPurchases: { ...purchases, [purchaseKey]: true } } : upgrades;
  const updated = await supabase('players', {
    method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${balance}`,
    body: { balance: balance - offer.price, upgrades: nextUpgrades }
  });
  if (!updated?.length) throw new Error('Профиль изменился, повтори покупку');
  const oldCount = Number(rows?.[0]?.count) || 0;
  try {
    await supabase('inventory', {
      method: 'POST', query: '?on_conflict=player_id,item_id', prefer: 'resolution=merge-duplicates,return=representation',
      body: { player_id: uid, item_id: offer.itemId, count: oldCount + offer.count, discovered: true }
    });
  } catch (error) {
    await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${balance - offer.price}`, body: { balance, upgrades } }).catch(() => {});
    throw error;
  }
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: 'shop_purchase', offer_id: offerId, item_id: offer.itemId, count: offer.count };
  return snapshot;
}

async function createStarInvoice(user, payload, req) {
  const productId = String(payload.product_id || '');
  const product = starProducts[productId];
  if (!product) throw new Error('Товар Stars не найден');
  const uid = Number(user.id);
  const players = await supabase('players', { query: `?telegram_id=eq.${uid}&select=upgrades,blocked` });
  const player = players?.[0];
  if (!player) throw new Error('Профиль не найден');
  if (player.blocked) throw new Error('Account is blocked');
  const cosmetics = player.upgrades?.cosmetics || {};
  if (cosmetics.owned?.[productId]) throw new Error('Косметика уже куплена');
  await ensurePaymentWebhook(req);
  const orderId = crypto.randomUUID();
  const order = { id: orderId, player_id: uid, product_id: productId, stars: product.stars, payload: orderId, status: 'pending' };
  await supabase('star_orders', { method: 'POST', body: order });
  try {
    const invoiceLink = await telegramApi('createInvoiceLink', {
      title: product.title, description: product.description, payload: orderId,
      currency: 'XTR', prices: [{ label: product.title, amount: product.stars }]
    });
    return { invoiceLink, orderId, product: { id: productId, title: product.title, stars: product.stars } };
  } catch (error) {
    await supabase('star_orders', { method: 'PATCH', query: `?id=eq.${orderId}&status=eq.pending`, body: { status: 'cancelled' } }).catch(() => {});
    throw error;
  }
}

async function equipCosmetic(user, payload) {
  const productId = String(payload.product_id || '');
  const product = starProducts[productId];
  if (!product) throw new Error('Косметика не найдена');
  const uid = Number(user.id);
  const rows = await supabase('players', { query: `?telegram_id=eq.${uid}&select=upgrades` });
  const player = rows?.[0];
  if (!player) throw new Error('Профиль не найден');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const cosmetics = upgrades.cosmetics && typeof upgrades.cosmetics === 'object' ? upgrades.cosmetics : {};
  if (!cosmetics.owned?.[productId]) throw new Error('Сначала купи эту косметику');
  const nextCosmetics = { ...cosmetics, active: { ...(cosmetics.active || {}), ...product.grants } };
  const updated = await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${uid}`, body: { upgrades: { ...upgrades, cosmetics: nextCosmetics } } });
  if (!updated?.length) throw new Error('Не удалось применить косметику');
  return attachEconomy(await rpc('player_snapshot', { p_id: uid }), uid);
}

async function economyStatus(user) {
  const uid = Number(user.id);
  return attachEconomy(await rpc('player_snapshot', { p_id: uid }), uid);
}

const weekKey = () => {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return `${now.getUTCFullYear()}-W${String(Math.ceil((((now - first) / 86400000) + first.getUTCDay() + 1) / 7)).padStart(2, '0')}`;
};
const seasonKey = () => new Date().toISOString().slice(0, 7);

async function marketState(user) {
  const uid = Number(user.id);
  const [active, history] = await Promise.all([
    supabase('market_listings', { query: '?status=eq.active&select=id,seller_id,item_id,price,status,created_at&order=created_at.desc&limit=40' }),
    supabase('market_listings', { query: `?or=(seller_id.eq.${uid},buyer_id.eq.${uid})&status=neq.active&select=id,seller_id,buyer_id,item_id,price,fee,status,created_at,sold_at&order=created_at.desc&limit=20` })
  ]);
  const ids = [...new Set([...(active || []).map(x => x.seller_id), ...(history || []).flatMap(x => [x.seller_id, x.buyer_id]).filter(Boolean)])];
  const names = {};
  if (ids.length) {
    const people = await supabase('players', { query: `?telegram_id=in.(${ids.join(',')})&select=telegram_id,display_name,level` });
    for (const person of people || []) names[String(person.telegram_id)] = { name: person.display_name, level: person.level };
  }
  return { active: (active || []).map(x => ({ ...x, seller: names[String(x.seller_id)] || { name: 'Игрок', level: 1 }, mine: Number(x.seller_id) === uid })), history: history || [], feePercent: 10, maxActive: 5 };
}

async function marketAction(user, action, payload) {
  const uid = Number(user.id);
  if (action !== 'state') await rpc('market_trade', { p_player_id: uid, p_action: action, p_payload: payload || {} });
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.market = await marketState(user);
  snapshot.event = { action: `market_${action}` };
  return snapshot;
}

async function clanMembership(uid) {
  const rows = await supabase('clan_members', { query: `?player_id=eq.${uid}&select=clan_id,role,contribution,joined_at&limit=1` });
  return rows?.[0] || null;
}

async function ensureClanRaid(clan) {
  const key = weekKey();
  const rows = await supabase('clan_raids', { query: `?clan_id=eq.${clan.id}&week_key=eq.${encodeURIComponent(key)}&select=*&limit=1` });
  if (rows?.[0]) return rows[0];
  const hp = 350000 + Number(clan.level || 1) * 150000;
  const created = await supabase('clan_raids', { method: 'POST', body: { clan_id: clan.id, week_key: key, max_hp: hp, current_hp: hp, reward_crystals: 40 + Number(clan.level || 1) * 10 } });
  return created?.[0];
}

async function ensureClanWar(clan) {
  const active = await supabase('clan_wars', { query: `?or=(clan_one.eq.${clan.id},clan_two.eq.${clan.id})&status=eq.active&select=*&order=starts_at.desc&limit=1` });
  if (active?.[0]) return active[0];
  const rivals = await supabase('clans', { query: `?id=neq.${clan.id}&select=id,name,emblem,level&order=season_points.desc&limit=1` });
  if (!rivals?.[0]) return null;
  const made = await supabase('clan_wars', { method: 'POST', body: { season_key: seasonKey(), clan_one: clan.id, clan_two: rivals[0].id } }).catch(() => null);
  return made?.[0] || null;
}

async function clanState(user) {
  const uid = Number(user.id);
  const membership = await clanMembership(uid);
  const publicClans = await supabase('clans', { query: '?select=id,name,emblem,level,xp,season_points&order=season_points.desc&limit=20' });
  if (!membership) return { membership: null, clans: publicClans || [], leaderboard: publicClans || [] };
  const clanRows = await supabase('clans', { query: `?id=eq.${membership.clan_id}&select=*&limit=1` });
  const clan = clanRows?.[0];
  if (!clan) return { membership: null, clans: publicClans || [] };
  const [members, raid, war] = await Promise.all([
    supabase('clan_members', { query: `?clan_id=eq.${clan.id}&select=player_id,role,contribution,joined_at&order=contribution.desc&limit=30` }),
    ensureClanRaid(clan), ensureClanWar(clan)
  ]);
  const ids = (members || []).map(x => x.player_id);
  const people = ids.length ? await supabase('players', { query: `?telegram_id=in.(${ids.join(',')})&select=telegram_id,display_name,level` }) : [];
  const names = Object.fromEntries((people || []).map(x => [String(x.telegram_id), x]));
  let raidAttacks = [], myRaidAttacks = 0, raidDamage = 0, raidClaimed = false;
  if (raid) {
    raidAttacks = await supabase('clan_raid_attacks', { query: `?raid_id=eq.${raid.id}&select=player_id,damage,created_at&limit=1000` });
    const today = new Date().toISOString().slice(0, 10);
    myRaidAttacks = (raidAttacks || []).filter(x => Number(x.player_id) === uid && String(x.created_at).startsWith(today)).length;
    raidDamage = (raidAttacks || []).filter(x => Number(x.player_id) === uid).reduce((sum, x) => sum + Number(x.damage || 0), 0);
    const claims = await supabase('mission_claims', { query: `?player_id=eq.${uid}&period=eq.${encodeURIComponent(raid.week_key)}&mission_id=eq.${encodeURIComponent(`clan_raid_${raid.id}`)}&select=mission_id` });
    raidClaimed = Boolean(claims?.length);
  }
  let warView = null;
  if (war) {
    const opponentId = war.clan_one === clan.id ? war.clan_two : war.clan_one;
    const opponent = (publicClans || []).find(x => x.id === opponentId) || (await supabase('clans', { query: `?id=eq.${opponentId}&select=id,name,emblem,level&limit=1` }))?.[0];
    const today = new Date().toISOString().slice(0, 10);
    const attacks = await supabase('clan_war_attacks', { query: `?war_id=eq.${war.id}&player_id=eq.${uid}&created_at=gte.${encodeURIComponent(today + 'T00:00:00Z')}&select=id` });
    warView = { ...war, opponent, mine: war.clan_one === clan.id ? Number(war.points_one) : Number(war.points_two), theirs: war.clan_one === clan.id ? Number(war.points_two) : Number(war.points_one), attacksToday: attacks?.length || 0 };
  }
  return { membership, clan, members: (members || []).map(x => ({ ...x, player: names[String(x.player_id)] || { display_name: 'Игрок', level: 1 } })), raid: raid ? { ...raid, myAttacksToday: myRaidAttacks, myDamage: raidDamage, claimed: raidClaimed } : null, war: warView, clans: publicClans || [], leaderboard: publicClans || [] };
}

async function clanAction(user, action, payload = {}) {
  const uid = Number(user.id);
  const membership = await clanMembership(uid);
  if (action === 'create') {
    if (membership) throw new Error('Ты уже состоишь в клане');
    const name = String(payload.name || '').trim();
    const emblem = ['crown','shield','sword','fire','galaxy','gem'].includes(payload.emblem) ? payload.emblem : 'crown';
    if (!/^[\p{L}\p{N} _-]{3,18}$/u.test(name)) throw new Error('Название: 3–18 букв или цифр');
    const players = await supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,level` });
    if (Number(players?.[0]?.level) < 3) throw new Error('Кланы открываются с 3 уровня');
    if (Number(players?.[0]?.balance) < 25000) throw new Error('Для создания нужно 25 000 Coins');
    const made = await supabase('clans', { method: 'POST', body: { name, emblem, owner_id: uid } });
    try {
      await supabase('clan_members', { method: 'POST', body: { clan_id: made[0].id, player_id: uid, role: 'owner' } });
      const paid = await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${Number(players[0].balance)}`, body: { balance: Number(players[0].balance) - 25000 } });
      if (!paid?.length) throw new Error('Профиль изменился, повтори создание');
    } catch (error) { await supabase('clans', { method: 'DELETE', query: `?id=eq.${made[0].id}` }).catch(() => {}); throw error; }
  } else if (action === 'join') {
    if (membership) throw new Error('Ты уже состоишь в клане');
    const clanId = String(payload.clan_id || '');
    const count = await supabase('clan_members', { query: `?clan_id=eq.${clanId}&select=player_id` });
    if ((count || []).length >= 30) throw new Error('В клане уже 30 участников');
    await supabase('clan_members', { method: 'POST', body: { clan_id: clanId, player_id: uid, role: 'member' } });
  } else if (action === 'leave') {
    if (!membership) throw new Error('Ты не состоишь в клане');
    if (membership.role === 'owner') {
      const members = await supabase('clan_members', { query: `?clan_id=eq.${membership.clan_id}&select=player_id` });
      if ((members || []).length > 1) throw new Error('Сначала передай роль владельца');
      await supabase('clans', { method: 'DELETE', query: `?id=eq.${membership.clan_id}` });
    } else await supabase('clan_members', { method: 'DELETE', query: `?player_id=eq.${uid}` });
  } else if (action === 'contribute') {
    if (!membership) throw new Error('Ты не состоишь в клане');
    const amount = Math.max(1000, Math.min(50000, Number(payload.amount) || 0));
    const players = await supabase('players', { query: `?telegram_id=eq.${uid}&select=balance` });
    if (Number(players?.[0]?.balance) < amount) throw new Error('Недостаточно Blox Coins');
    const clans = await supabase('clans', { query: `?id=eq.${membership.clan_id}&select=xp` });
    const xp = Number(clans?.[0]?.xp || 0) + amount;
    await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${uid}&balance=eq.${Number(players[0].balance)}`, body: { balance: Number(players[0].balance) - amount } });
    await Promise.all([
      supabase('clans', { method: 'PATCH', query: `?id=eq.${membership.clan_id}`, body: { xp, level: Math.min(20, 1 + Math.floor(xp / 100000)) } }),
      supabase('clan_members', { method: 'PATCH', query: `?player_id=eq.${uid}`, body: { contribution: Number(membership.contribution || 0) + amount } })
    ]);
  } else if (action === 'role') {
    if (!membership || membership.role !== 'owner') throw new Error('Только владелец меняет роли');
    const target = Number(payload.player_id);
    if (!target || target === uid) throw new Error('Неверный участник');
    if (payload.role === 'kick') await supabase('clan_members', { method: 'DELETE', query: `?player_id=eq.${target}&clan_id=eq.${membership.clan_id}` });
    else if (['member','officer'].includes(payload.role)) await supabase('clan_members', { method: 'PATCH', query: `?player_id=eq.${target}&clan_id=eq.${membership.clan_id}`, body: { role: payload.role } });
  } else if (action === 'raid_attack') {
    if (!membership) throw new Error('Вступи в клан');
    const state = await clanState(user), raid = state.raid;
    if (!raid || raid.status !== 'active') throw new Error('Рейд уже завершён');
    if (raid.myAttacksToday >= 3) throw new Error('Сегодня использованы 3 атаки');
    const [players, inventory] = await Promise.all([supabase('players', { query: `?telegram_id=eq.${uid}&select=level,upgrades,equipped_id` }), supabase('inventory', { query: `?player_id=eq.${uid}&count=gt.0&select=item_id,count` })]);
    const damage = Math.max(1000, Math.round(calculateHeroPower(players[0], inventory || []) * (0.8 + crypto.randomInt(41) / 100)));
    const hp = Math.max(0, Number(raid.current_hp) - damage);
    const updated = await supabase('clan_raids', { method: 'PATCH', query: `?id=eq.${raid.id}&current_hp=eq.${raid.current_hp}&status=eq.active`, body: { current_hp: hp, status: hp ? 'active' : 'defeated', defeated_at: hp ? null : new Date().toISOString() } });
    if (!updated?.length) throw new Error('Босс уже получил урон, повтори атаку');
    await supabase('clan_raid_attacks', { method: 'POST', body: { raid_id: raid.id, player_id: uid, damage } });
  } else if (action === 'raid_claim') {
    if (!membership) throw new Error('Вступи в клан');
    const state = await clanState(user), raid = state.raid;
    if (!raid || raid.status !== 'defeated' || !raid.myDamage) throw new Error('Награда пока недоступна');
    if (raid.claimed) throw new Error('Награда уже получена');
    const attacks = await supabase('clan_raid_attacks', { query: `?raid_id=eq.${raid.id}&select=damage` });
    const total = (attacks || []).reduce((sum, x) => sum + Number(x.damage || 0), 0);
    const reward = Math.max(2, Math.round(Number(raid.reward_crystals) * raid.myDamage / Math.max(1, total)));
    const missionId = `clan_raid_${raid.id}`;
    await supabase('mission_claims', { method: 'POST', body: { player_id: uid, period: raid.week_key, mission_id: missionId } });
    const players = await supabase('players', { query: `?telegram_id=eq.${uid}&select=crystals` });
    const granted = await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${uid}&crystals=eq.${Number(players[0].crystals)}`, body: { crystals: Number(players[0].crystals) + reward } });
    if (!granted?.length) {
      await supabase('mission_claims', { method: 'DELETE', query: `?player_id=eq.${uid}&period=eq.${encodeURIComponent(raid.week_key)}&mission_id=eq.${encodeURIComponent(missionId)}` }).catch(() => {});
      throw new Error('Профиль изменился, повтори получение');
    }
  } else if (action === 'war_attack') {
    if (!membership) throw new Error('Вступи в клан');
    const state = await clanState(user), war = state.war;
    if (!war) throw new Error('Ждём клан-соперник');
    if (war.attacksToday >= 5) throw new Error('Сегодня использованы 5 боёв');
    const won = crypto.randomInt(100) < 55;
    const points = won ? 80 + crypto.randomInt(71) : 20 + crypto.randomInt(31);
    const field = war.clan_one === membership.clan_id ? 'points_one' : 'points_two';
    await supabase('clan_wars', { method: 'PATCH', query: `?id=eq.${war.id}`, body: { [field]: Number(war[field]) + points } });
    await Promise.all([
      supabase('clan_war_attacks', { method: 'POST', body: { war_id: war.id, clan_id: membership.clan_id, player_id: uid, points, won } }),
      supabase('clans', { method: 'PATCH', query: `?id=eq.${membership.clan_id}`, body: { season_points: Number(state.clan.season_points || 0) + points } })
    ]);
  }
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.clan = await clanState(user);
  snapshot.event = { action: `clan_${action}` };
  return snapshot;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST required' });
  try {
    const user = verifyTelegram(req.headers['x-telegram-init-data']);
    const body = await readBody(req);
    const action = String(body.action || 'bootstrap');
    const allowed = new Set(['bootstrap', 'spin', 'pve_fight', 'battle_start', 'battle_turn', 'pvp_targets', 'pvp_match', 'pvp_online', 'pet_upgrade', 'claim_pvp_league', 'survivor_start', 'survivor_finish', 'claim_daily', 'claim_mission', 'buy_upgrade', 'upgrade_item', 'aura_upgrade', 'evolve_item', 'shop_buy', 'star_invoice', 'cosmetic_equip', 'economy_status', 'item_action', 'claim_achievement', 'claim_league', 'rescue', 'open_chest', 'claim_season', 'claim_weekly', 'redeem_promo', 'referral_info', 'tournament_join', 'market_state', 'market_sell', 'market_buy', 'market_cancel', 'clan_state', 'clan_create', 'clan_join', 'clan_leave', 'clan_contribute', 'clan_role', 'clan_raid_attack', 'clan_raid_claim', 'clan_war_attack']);
    if (!allowed.has(action)) return json(res, 400, { ok: false, error: 'Unknown action' });
    if (action.startsWith('market_')) {
      const payload = await marketAction(user, action.slice(7), body.payload || {});
      payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action.startsWith('clan_')) {
      const payload = await clanAction(user, action.slice(5), body.payload || {});
      payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action === 'claim_mission' && ['bots3','spins3','tower1','pvp1','upgrade1'].includes(String(body.payload?.id || ''))) {
      const payload = await rpc('claim_daily_mission', { p_id: Number(user.id), p_mission: String(body.payload.id) });
      payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action === 'upgrade_item') {
      const payload = await upgradeItem(user, body.payload || {});
      if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action === 'aura_upgrade' || action === 'evolve_item' || action === 'shop_buy') {
      const payload = action === 'aura_upgrade' ? await auraUpgrade(user) : action === 'evolve_item' ? await evolveItem(user, body.payload || {}) : await shopBuy(user, body.payload || {});
      await attachEconomy(payload, Number(user.id));
      if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action === 'star_invoice') return json(res, 200, { ok: true, data: await createStarInvoice(user, body.payload || {}, req) });
    if (action === 'cosmetic_equip' || action === 'economy_status') {
      const payload = action === 'cosmetic_equip' ? await equipCosmetic(user, body.payload || {}) : await economyStatus(user);
      payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action === 'pve_fight') {
      const payload = await pveFight(user, body.payload || {});
      if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action === 'battle_start' || action === 'battle_turn') {
      const payload = action === 'battle_start' ? await battleStart(user, body.payload || {}) : await battleTurn(user, body.payload || {});
      if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action === 'pvp_targets' || action === 'pvp_match') {
      const payload = action === 'pvp_targets' ? await pvpTargets(user) : await pvpMatch(user, body.payload || {});
      if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action === 'pvp_online' || action === 'pet_upgrade' || action === 'claim_pvp_league') {
      const payload = action === 'pvp_online' ? await onlinePvp(user, body.payload || {}) : action === 'pet_upgrade' ? await petUpgrade(user) : await claimPvpLeague(user);
      if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      return json(res, 200, { ok: true, data: payload });
    }
    if (action === 'survivor_start' || action === 'survivor_finish') {
      const payload = await survivorAction(user, body.payload || {}, action === 'survivor_finish');
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
    if (action === 'claim_achievement') {
      const amounts = { firstSpin: 1, collector: 2, winner10: 3, spins25: 3, level5: 5, secret: 10 };
      await rpc('grant_claim_crystals', { p_id: Number(user.id), p_kind: 'achievement', p_key: String(body.payload?.id || ''), p_amount: amounts[body.payload?.id] || 1 });
      payload = await rpc('player_snapshot', { p_id: Number(user.id) });
    }
    if (action === 'claim_season') {
      const level = Math.max(1, Math.min(50, Number(body.payload?.level) || 1));
      await rpc('grant_claim_crystals', { p_id: Number(user.id), p_kind: 'season', p_key: `${seasonKey()}_${level}`, p_amount: level * 2 });
      payload = await rpc('player_snapshot', { p_id: Number(user.id) });
    }
    if (action === 'bootstrap') {
      await attachEconomy(payload, Number(user.id));
      payload.market = await marketState(user).catch(() => ({ active: [], history: [], feePercent: 10, maxActive: 5 }));
      payload.clan = await clanState(user).catch(() => ({ membership: null, clans: [], leaderboard: [] }));
    }
    if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
    return json(res, 200, { ok: true, data: payload });
  } catch (error) {
    const status = /signature|session|authorization|user is missing/i.test(error.message) ? 401 : /not configured/i.test(error.message) ? 503 : 400;
    return json(res, status, { ok: false, error: error.message });
  }
};
