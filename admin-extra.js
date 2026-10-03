// Loaded after the owner panel; all writes still require verified Telegram auth.
const fmt=value=>Number(value||0).toLocaleString('ru-RU');
const date=value=>value?new Date(value).toLocaleString('ru-RU'):'—';
const rowList=(rows,renderRow)=>rows.length?rows.map(renderRow).join(''):'<p class="empty">Пока нет записей</p>';
const originalRender=render;
render=function(){originalRender();
  $('economyStats').textContent=`Активны за 24 ч: ${fmt(state.totals?.active24h)} · Заблокированы: ${fmt(state.totals?.blocked)} · Crystals: ${fmt(state.totals?.crystals)} · Выдано Coins: ${fmt(state.economy?.coinsIssued)} · Списано: ${fmt(state.economy?.coinsRemoved)}`;
  if(document.activeElement!==$('configJson'))$('configJson').value=JSON.stringify(state.config||{},null,2);
  $('promoList').innerHTML=rowList(state.promos||[],p=>`<div class="record"><strong>${escapeHtml(p.code)}</strong><span>${p.active?'Активен':'Отключён'} · ${fmt(p.uses)} / ${fmt(p.max_uses)}</span><p>${fmt(p.reward)} Coins · ${fmt(p.reward_crystals)} Crystals · ${escapeHtml(p.reward_item||'—')} × ${fmt(p.reward_item_count)} · ${escapeHtml(p.reward_cosmetic||'—')}</p><small>Ур. ${fmt(p.min_level)} · ${date(p.starts_at)} — ${date(p.expires_at)}</small><p><button data-promo-toggle="${escapeHtml(p.code)}" data-active="${!p.active}">${p.active?'Отключить':'Включить'}</button></p></div>`);
  $('eventList').innerHTML=rowList(state.tournaments||[],t=>`<div class="record"><strong>${escapeHtml(t.name)}</strong><p>${date(t.starts_at)} — ${date(t.ends_at)} · ${fmt(t.reward_pool)} Coins · ${t.active?'Активен':'Завершён'}</p><button data-event-toggle="${escapeHtml(t.id)}" data-active="${!t.active}">${t.active?'Остановить':'Включить'}</button></div>`);
  $('auditList').innerHTML=rowList(state.audit||[],a=>`<details class="record"><summary>${escapeHtml(a.action)} · ${date(a.created_at)} · ${escapeHtml(a.admin_id)}</summary><pre>${escapeHtml(JSON.stringify(a.payload,null,2))}</pre></details>`);
};
async function perform(button,action,payload){if(button.disabled)return;button.disabled=true;try{state=await call(action,payload);render();toast('Сохранено')}catch(e){toast(e.message)}finally{button.disabled=false}}
const iso=id=>$(id).value?new Date($(id).value).toISOString():null;
$('createPromo').onclick=()=>perform($('createPromo'),'create_promo',{code:$('promoCode').value.trim().toUpperCase(),reward:Number($('promoReward').value),reward_crystals:Number($('promoCrystals').value),reward_item:$('promoItem').value,reward_item_count:Number($('promoCount').value),reward_cosmetic:$('promoCosmetic').value,max_uses:Number($('promoUses').value),min_level:Number($('promoLevel').value),starts_at:iso('promoStarts'),expires_at:iso('promoExpires')});
$('createTournament').onclick=()=>{if(!$('tournamentEnds').value)return toast('Укажи время завершения');perform($('createTournament'),'create_tournament',{name:$('tournamentName').value.trim(),ends_at:iso('tournamentEnds'),reward_pool:Number($('tournamentReward').value)})};
$('saveConfig').onclick=()=>{try{perform($('saveConfig'),'set_config',JSON.parse($('configJson').value))}catch{toast('Проверь формат JSON')}};
$('refreshAdmin').onclick=refresh;
document.querySelector('.buttons').onclick=e=>{const b=e.target.closest('[data-action]');if(!b)return;const telegram_id=Number($('targetId').value);if(!Number.isSafeInteger(telegram_id)||telegram_id<=0)return toast('Укажи Telegram ID');const payload={telegram_id};if(['grant_coins','grant_crystals'].includes(b.dataset.action))payload.amount=Number($('coinAmount').value);if(b.dataset.action==='grant_item'){payload.item_id=$('itemId').value;payload.count=Number($('grantCount').value)}if(b.dataset.action==='set_blocked')payload.blocked=b.dataset.blocked==='true';perform(b,b.dataset.action,payload)};
document.querySelectorAll('label').forEach(label=>{const input=label.parentElement.querySelector('input,select,textarea');if(input)label.htmlFor=input.id});

$('promoList').onclick=e=>{const b=e.target.closest('[data-promo-toggle]');if(b)perform(b,'set_promo_active',{code:b.dataset.promoToggle,active:b.dataset.active==='true'})};
$('eventList').onclick=e=>{const b=e.target.closest('[data-event-toggle]');if(b)perform(b,'set_tournament_active',{id:b.dataset.eventToggle,active:b.dataset.active==='true'})};
$('searchServer').onclick=()=>perform($('searchServer'),'overview',{search:$('search').value.trim()});
