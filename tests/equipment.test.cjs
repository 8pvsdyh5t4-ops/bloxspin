const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const equipment=require('../equipment');
const inventory=Object.keys(equipment.itemSlots).map(item_id=>({item_id,count:1}));
const six={weapon:'sword',armor:'block',crown:'crown',pet:'pet',aura:'crystal',skin:'secret'};
const source=fs.readFileSync(require.resolve('../api/game.js'),'utf8');
const sandbox={module:{exports:{}},exports:{},require:n=>n==='./_lib'?{}:n==='./_request'?{protectedHandler:x=>x}:require(n),console,process,Buffer};
vm.runInNewContext(source+'\nmodule.exports.test={calculateHeroStats,combatItems,createBattleState};',sandbox);
const {calculateHeroStats,combatItems,createBattleState}=sandbox.module.exports.test;
test('six slots sum every item once, including scaled upgrades and evolutions',()=>{
  const upgrades={itemLevels:{sword:4,pet:3},evolutions:{sword:2}};
  const all=equipment.bonuses(six,inventory,upgrades,combatItems);
  let power=0;const stats={};
  for(const [slot,id] of Object.entries(six)){
    const single=equipment.bonuses({[slot]:id},inventory,upgrades,combatItems);power+=single.power;
    for(const [key,value] of Object.entries(single.stats))stats[key]=(stats[key]||0)+value;
  }
  assert.equal(all.power,power);assert.deepEqual(all.stats,stats);assert.equal(Object.keys(all.loadout).length,6);
  assert.equal(all.stats.attack,542+182+420);
});
test('rejects wrong slots, unknown items and depleted inventory; empty loadout is authoritative',()=>{
  assert.deepEqual(equipment.normalize({weapon:'crown',pet:'sword',armor:'unknown'},inventory,'sword'),{});
  assert.deepEqual(equipment.normalize(six,[{item_id:'sword',count:0},{item_id:'pet',count:1}]),{pet:'pet'});
  assert.deepEqual(equipment.normalize({},inventory,'sword'),{});
  assert.deepEqual(equipment.normalize(undefined,inventory,'sword'),{weapon:'sword'});
});
test('browser and server equipment bonus implementations are identical',()=>{
  const browser={};vm.runInNewContext(fs.readFileSync(require.resolve('../equipment'),'utf8'),browser);
  const actual=browser.BloxEquipment.bonuses(six,inventory,{itemLevels:{crown:7}},combatItems);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),equipment.bonuses(six,inventory,{itemLevels:{crown:7}},combatItems));
});
test('all slots increase battle power and removing one preserves the other five',()=>{
  const player={level:10,upgrades:{},equipped_id:'secret',equipment:six};
  const all=calculateHeroStats(player,inventory),without=calculateHeroStats({...player,equipment:{...six,weapon:undefined}},inventory);
  assert.equal(all.attack-without.attack,220);assert.equal(all.crit-without.crit,3);
  assert.equal(all.hp,without.hp);assert.ok(all.power>without.power);
  const battle=createBattleState(all,{id:'test',name:'Test',type:'tank',power:2600,reward:[10,20],xp:10},inventory,'pve');
  assert.equal(battle.heroPower,all.power);assert.equal(battle.heroStats.attack,all.attack);assert.equal(battle.maxHeroHp,all.hp);
});
test('legacy one-item stats match the migrated slot and PostgREST rows',()=>{
  const player={level:5,upgrades:{itemLevels:{sword:3}},equipped_id:'sword'};
  const old=calculateHeroStats(player,inventory);
  const next=calculateHeroStats({...player,player_equipment:[{slot:'weapon',item_id:'sword'}]},inventory);
  assert.deepEqual(old,next);
});
