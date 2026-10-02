const crypto = require('crypto');
const { json, readBody, supabase } = require('./_lib');

const starProducts = {
  neon_frame: { stars: 75, grants: { frame: 'neon' } },
  victory_burst: { stars: 90, grants: { effect: 'prism' } },
  void_trail: { stars: 120, grants: { trail: 'void' } },
  cyber_royal_skin: { stars: 250, grants: { skin: 'cyber_royal' } },
  founder_pack: { stars: 450, grants: { frame: 'founder', trail: 'gold', skin: 'founder', effect: 'crown' } }
};

const expectedSecret = () => crypto.createHash('sha256').update(`${process.env.TELEGRAM_BOT_TOKEN || ''}:bloxspin-stars`).digest('hex');

async function telegramApi(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram is not configured');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || 'Telegram API error');
  return result.result;
}

async function answerCheckout(query, ok, errorMessage) {
  await telegramApi('answerPreCheckoutQuery', { pre_checkout_query_id: query.id, ok, ...(ok ? {} : { error_message: errorMessage }) });
}

async function handleCheckout(query) {
  const rows = await supabase('star_orders', { query: `?payload=eq.${encodeURIComponent(query.invoice_payload || '')}&select=id,player_id,product_id,stars,status` });
  const order = rows?.[0], product = starProducts[order?.product_id];
  const valid = order && product && order.status === 'pending' && Number(order.player_id) === Number(query.from?.id) && query.currency === 'XTR' && Number(query.total_amount) === Number(order.stars) && Number(order.stars) === product.stars;
  await answerCheckout(query, Boolean(valid), 'Заказ устарел или не совпадает с товаром. Открой магазин заново.');
}

async function deliverPayment(message) {
  const payment = message.successful_payment;
  if (!payment || payment.currency !== 'XTR') return;
  const rows = await supabase('star_orders', { query: `?payload=eq.${encodeURIComponent(payment.invoice_payload || '')}&select=id,player_id,product_id,stars,status,telegram_charge_id` });
  const order = rows?.[0], product = starProducts[order?.product_id];
  if (!order || !product) throw new Error('Star order not found');
  if (order.status === 'paid') return;
  if (!['pending', 'processing'].includes(order.status)) throw new Error('Star order is closed');
  if (Number(order.player_id) !== Number(message.from?.id) || Number(order.stars) !== Number(payment.total_amount) || Number(order.stars) !== product.stars) throw new Error('Star payment mismatch');
  const chargeId = String(payment.telegram_payment_charge_id || '');
  if (!chargeId) throw new Error('Telegram charge id is missing');
  if (order.status === 'pending') {
    const locked = await supabase('star_orders', { method: 'PATCH', query: `?id=eq.${order.id}&status=eq.pending`, body: { status: 'processing', telegram_charge_id: chargeId } });
    if (!locked?.length) return;
  }
  const players = await supabase('players', { query: `?telegram_id=eq.${Number(order.player_id)}&select=upgrades` });
  const player = players?.[0];
  if (!player) throw new Error('Player not found');
  const upgrades = player.upgrades && typeof player.upgrades === 'object' ? player.upgrades : {};
  const cosmetics = upgrades.cosmetics && typeof upgrades.cosmetics === 'object' ? upgrades.cosmetics : {};
  const nextCosmetics = {
    ...cosmetics,
    owned: { ...(cosmetics.owned || {}), [order.product_id]: true },
    active: { ...(cosmetics.active || {}), ...product.grants }
  };
  await supabase('players', { method: 'PATCH', query: `?telegram_id=eq.${Number(order.player_id)}`, body: { upgrades: { ...upgrades, cosmetics: nextCosmetics } } });
  await supabase('star_orders', { method: 'PATCH', query: `?id=eq.${order.id}&status=eq.processing`, body: { status: 'paid', telegram_charge_id: chargeId, paid_at: new Date().toISOString() } });
  await supabase('economy_ledger', { method: 'POST', body: { player_id: Number(order.player_id), currency: 'stars', amount: -Number(order.stars), event_type: 'stars_purchase', metadata: { product_id: order.product_id, charge_id: chargeId } } }).catch(error => console.error('Star ledger write failed', error));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false });
  try {
    const supplied = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    const expected = expectedSecret();
    if (!supplied || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return json(res, 401, { ok: false });
    const update = await readBody(req);
    if (update.pre_checkout_query) await handleCheckout(update.pre_checkout_query);
    if (update.message?.successful_payment) await deliverPayment(update.message);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('Telegram payment webhook failed', error);
    return json(res, 500, { ok: false });
  }
};
