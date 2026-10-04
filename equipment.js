(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BloxEquipment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const slots = Object.freeze(['weapon', 'armor', 'crown', 'pet', 'aura', 'skin']);
  const itemSlots = Object.freeze({sword:'weapon', eclipse_blade:'weapon', block:'armor', crown:'crown', pet:'pet', nova_pet:'pet', crystal:'aura', void_relic:'aura', secret:'skin'});
  function normalize(equipment, inventory, legacy = '') {
    const owned = Array.isArray(inventory) ? Object.fromEntries(inventory.map(row => [row.item_id, row.count])) : inventory || {};
    const source = Array.isArray(equipment) ? Object.fromEntries(equipment.map(row => [row.slot, row.item_id])) : equipment;
    const result = {};
    if (source && typeof source === 'object') {
      for (const slot of slots) {
        const id = source[slot];
        if (Object.hasOwn(itemSlots, id) && itemSlots[id] === slot && Number(owned[id]) > 0) result[slot] = id;
      }
    } else if (Object.hasOwn(itemSlots, legacy) && Number(owned[legacy]) > 0) result[itemSlots[legacy]] = legacy;
    return result;
  }
  function bonuses(equipment, inventory, upgrades, catalog, legacy) {
    const loadout = normalize(equipment, inventory, legacy), stats = {};
    let power = 0;
    for (const id of Object.values(loadout)) {
      const item = catalog[id];
      if (!item) continue;
      const level = Math.max(1, Math.min(10, Number(upgrades?.itemLevels?.[id]) || 1));
      const evolution = Math.max(0, Math.min(3, Number(upgrades?.evolutions?.[id]) || 0));
      const scale = (1 + (level - 1) * .15) * (1 + evolution * .35);
      for (const [key, value] of Object.entries(item.stats)) stats[key] = (stats[key] || 0) + Math.round(value * scale);
      power += Math.round(item.basePower * (1 + (level - 1) * .18) * (1 + evolution * .4));
    }
    return {loadout, stats, power};
  }
  return {slots, itemSlots, normalize, bonuses};
});
