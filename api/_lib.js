const crypto = require('crypto');

const json = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const readBody = async req => {
  if (req.body && typeof req.body === 'object') {
    if(Array.isArray(req.body)||JSON.stringify(req.body).length>65536)throw new Error('Invalid request body');
    return req.body;
  }
  if(typeof req.body==='string'){if(req.body.length>65536)throw new Error('Request too large');const body=JSON.parse(req.body);if(!body||Array.isArray(body)||typeof body!=='object')throw new Error('Invalid request body');return body}
  let raw = '';
  for await (const chunk of req) {raw += chunk;if(raw.length>65536)throw new Error('Request too large')}
  const body=raw?JSON.parse(raw):{};
  if(!body||Array.isArray(body)||typeof body!=='object')throw new Error('Invalid request body');
  return body;
};

function verifyTelegram(initData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || typeof initData!=='string' || !initData || initData.length>16384) throw new Error('Telegram authorization is unavailable');
  const params = new URLSearchParams(initData);
  if(new Set(params.keys()).size!==[...params.keys()].length)throw new Error('Invalid Telegram initData');
  const received = params.get('hash') || '';
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(received) || !crypto.timingSafeEqual(Buffer.from(received,'hex'), Buffer.from(expected,'hex'))) throw new Error('Invalid Telegram signature');
  const authDate = Number(params.get('auth_date') || 0);
  const age=Date.now()/1000-authDate;
  if (!Number.isSafeInteger(authDate) || authDate<=0 || age>86400 || age < -30) throw new Error('Telegram session expired');
  const user = JSON.parse(params.get('user') || '{}');
  if (!Number.isSafeInteger(user.id) || user.id<=0) throw new Error('Telegram user is missing');
  return user;
}

const ownerNames = () => (process.env.OWNER_TELEGRAM_USERNAMES || 'megarel1g').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const ownerIds = () => (process.env.OWNER_TELEGRAM_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
const isOwner = user => ownerIds().length ? ownerIds().includes(String(user.id)) : ownerNames().includes(String(user.username || '').toLowerCase());

async function supabase(path, { method = 'GET', body, query = '', prefer } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Database is not configured');
  const response = await fetch(`${url}/rest/v1/${path}${query}`, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: prefer || (method === 'POST' || method === 'PATCH' ? 'return=representation' : undefined)
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.hint || `Database error ${response.status}`);
  return data;
}

const rpc = (name, body) => supabase(`rpc/${name}`, { method: 'POST', body });

function publicUser(user) {
  return {
    id: Number(user.id),
    username: user.username || '',
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    photo_url: user.photo_url || ''
  };
}

module.exports = { json, readBody, verifyTelegram, isOwner, supabase, rpc, publicUser };
