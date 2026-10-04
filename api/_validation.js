const items = new Set(['block','sword','pet','crystal','crown','secret','eclipse_blade','nova_pet','void_relic']);
const cosmetics = new Set(['neon_frame','victory_burst','void_trail','cyber_royal_skin','founder_pack']);
function integer(value,name,min=0,max=1000000000){if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`Invalid ${name}`);return value}
function timestamp(value,name){if(value!==null&&value!==undefined&&value!==''&&!Number.isFinite(Date.parse(value)))throw new Error(`Invalid ${name}`)}
function validateAdmin(action,payload){
  if(!payload||Array.isArray(payload)||typeof payload!=='object')throw new Error('Invalid payload');
  if(['grant_coins','grant_crystals','grant_item','set_blocked'].includes(action))integer(payload.telegram_id,'player ID',1,Number.MAX_SAFE_INTEGER);
  if(action==='grant_crystals')integer(payload.amount,'amount',1,1000000);
  if(action==='overview'&&payload.search!==undefined&&(typeof payload.search!=='string'||payload.search.length>100))throw new Error('Invalid search');
  if(['set_promo_active','set_tournament_active'].includes(action)&&typeof payload.active!=='boolean')throw new Error('Invalid active state');
  if(action==='set_promo_active'&&!/^[A-Z0-9_-]{3,32}$/.test(payload.code||''))throw new Error('Invalid code');
  if(action==='set_tournament_active'&&!/^[0-9a-f-]{36}$/i.test(payload.id||''))throw new Error('Invalid tournament');
  if(action==='grant_coins')integer(payload.amount,'amount',1);
  if(action==='grant_item'){if(!items.has(payload.item_id))throw new Error('Unknown item');integer(payload.count??1,'count',1,10000)}
  if(action==='set_blocked'&&typeof payload.blocked!=='boolean')throw new Error('Invalid blocked state');
  if(action==='create_promo'){
    payload.code=String(payload.code||'').trim().toUpperCase();
    if(!/^[A-Z0-9_-]{3,32}$/.test(payload.code))throw new Error('Promo code must contain 3–32 letters, digits, _ or -');
    for(const key of ['reward','reward_crystals','reward_item_count'])integer(payload[key]??0,key);
    integer(payload.max_uses??100,'max_uses',1);integer(payload.min_level??1,'min_level',1,100000);
    if(payload.reward_item&&!items.has(payload.reward_item))throw new Error('Unknown reward item');
    if(Boolean(payload.reward_item)!==Boolean(payload.reward_item_count))throw new Error('Specify both reward item and count');
    if(payload.reward_cosmetic&&!cosmetics.has(payload.reward_cosmetic))throw new Error('Unknown cosmetic');
    if(!payload.reward&&!payload.reward_crystals&&!payload.reward_item_count&&!payload.reward_cosmetic)throw new Error('Promo code needs a reward');
    timestamp(payload.starts_at,'starts_at');timestamp(payload.expires_at,'expires_at');
    if(payload.starts_at&&payload.expires_at&&Date.parse(payload.expires_at)<=Date.parse(payload.starts_at))throw new Error('Expiry must be after start');
  }
  if(action==='create_tournament'){if(typeof payload.name!=='string'||!payload.name.trim()||payload.name.length>80)throw new Error('Invalid tournament name');timestamp(payload.ends_at,'ends_at');if(!payload.ends_at||Date.parse(payload.ends_at)<=Date.now())throw new Error('Tournament must end in the future');integer(payload.reward_pool,'reward_pool',1)}
  if(action==='set_config'&&JSON.stringify(payload).length>16000)throw new Error('Configuration too large');
  return payload;
}
module.exports={validateAdmin,integer};
