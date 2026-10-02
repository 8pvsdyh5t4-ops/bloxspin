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

function calculateHeroStats(player, inventory) {
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
  const power = Math.round(hp * 0.45 + attack * 2.2 + defense * 1.25 + speed * 5 + crit * 45 + critDamage * 8 + itemPower);
  return { hp, attack, defense, speed, crit, critDamage, power };
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

const randomDamage = value => Math.max(1, Math.round(value * (90 + crypto.randomInt(21)) / 100));

async function battleTurn(user, payload) {
  const uid = Number(user.id);
  const move = String(payload.move || 'attack');
  if (!['attack', 'skill', 'pet', 'aura'].includes(move)) throw new Error('Invalid battle move');
  const players = await supabase('players', { query: `?telegram_id=eq.${uid}&select=balance,level,xp,upgrades,blocked` });
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
  if (move === 'pet') { multiplier = 0.75; battle.petCd = 3; log.push('Питомец атакует противника'); }
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
  let drop = '';
  let nextUpgrades = { ...upgrades, battle };
  if (victory || defeat) {
    const pve = upgrades.pve && typeof upgrades.pve === 'object' ? upgrades.pve : {};
    const tower = upgrades.tower && typeof upgrades.tower === 'object' ? upgrades.tower : { floor: 1, best: 0, wins: 0 };
    reward = victory ? crypto.randomInt(Number(battle.rewardMin), Number(battle.rewardMax) + 1) : 0;
    xpReward = victory ? Number(battle.xpReward) : 10;
    nextUpgrades = { ...upgrades };
    delete nextUpgrades.battle;
    if (battle.mode === 'tower') nextUpgrades.tower = { floor: victory ? Number(battle.floor) + 1 : Number(battle.floor), best: Math.max(Number(tower.best) || 0, victory ? Number(battle.floor) : 0), wins: (Number(tower.wins) || 0) + (victory ? 1 : 0) };
    else nextUpgrades.pve = { battles: (Number(pve.battles) || 0) + 1, wins: (Number(pve.wins) || 0) + (victory ? 1 : 0), lastEnemy: battle.enemyId };
    if (battle.mode === 'boss') {
      const bosses = upgrades.bosses && typeof upgrades.bosses === 'object' ? upgrades.bosses : {};
      nextUpgrades.bosses = { wins: (Number(bosses.wins) || 0) + (victory ? 1 : 0), seasonalWins: (Number(bosses.seasonalWins) || 0) + (victory && battle.seasonal ? 1 : 0), lastBoss: battle.enemyId };
      if (victory && battle.dropId && crypto.randomInt(100) < Number(battle.dropChance || 0)) drop = battle.dropId;
    }
  }
  const updated = await supabase('players', {
    method: 'PATCH',
    query: `?telegram_id=eq.${uid}&balance=eq.${balance}&xp=eq.${xp}`,
    body: { balance: balance + reward, xp: xp + xpReward, upgrades: nextUpgrades }
  });
  if (!updated?.length) throw new Error('Profile changed, try again');
  if (drop) {
    const rows = await supabase('inventory', { query: `?player_id=eq.${uid}&item_id=eq.${encodeURIComponent(drop)}&select=count` });
    const count = Number(rows?.[0]?.count) || 0;
    await supabase('inventory', { method: 'POST', query: '?on_conflict=player_id,item_id', prefer: 'resolution=merge-duplicates,return=representation', body: { player_id: uid, item_id: drop, count: count + 1, discovered: true } }).catch(() => { drop = ''; });
  }
  if (victory || defeat) await rpc('apply_player_levels', { p_id: uid });
  const snapshot = await rpc('player_snapshot', { p_id: uid });
  snapshot.event = { status: victory ? 'victory' : defeat ? 'defeat' : 'active', battle: victory || defeat ? null : battle, finishedBattle: victory || defeat ? battle : null, log, reward, xp: xpReward, drop };
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
  return rpc('player_snapshot', { p_id: uid });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST required' });
  try {
    const user = verifyTelegram(req.headers['x-telegram-init-data']);
    const body = await readBody(req);
    const action = String(body.action || 'bootstrap');
    const allowed = new Set(['bootstrap', 'spin', 'pve_fight', 'battle_start', 'battle_turn', 'survivor_start', 'survivor_finish', 'claim_daily', 'claim_mission', 'buy_upgrade', 'upgrade_item', 'item_action', 'claim_achievement', 'claim_league', 'rescue', 'open_chest', 'claim_season', 'claim_weekly', 'redeem_promo', 'referral_info', 'tournament_join']);
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
    if (action === 'battle_start' || action === 'battle_turn') {
      const payload = action === 'battle_start' ? await battleStart(user, body.payload || {}) : await battleTurn(user, body.payload || {});
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
    if (payload && typeof payload === 'object') payload.bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
    return json(res, 200, { ok: true, data: payload });
  } catch (error) {
    const status = /signature|session|authorization|user is missing/i.test(error.message) ? 401 : /not configured/i.test(error.message) ? 503 : 400;
    return json(res, status, { ok: false, error: error.message });
  }
};
