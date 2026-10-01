const crypto = require('crypto');

const json = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const readBody = async req => {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
};

function verifyTelegram(initData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !initData) throw new Error('Telegram authorization is unavailable');
  const params = new URLSearchParams(initData);
  const received = params.get('hash') || '';
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (!received || received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) throw new Error('Invalid Telegram signature');
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) throw new Error('Telegram session expired');
  const user = JSON.parse(params.get('user') || '{}');
  if (!user.id) throw new Error('Telegram user is missing');
  return user;
}

const ownerNames = () => (process.env.OWNER_TELEGRAM_USERNAMES || 'megarel1g').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const ownerIds = () => (process.env.OWNER_TELEGRAM_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
const isOwner = user => ownerIds().includes(String(user.id)) || ownerNames().includes(String(user.username || '').toLowerCase());

async function supabase(path, { method = 'GET', body, query = '', prefer } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Database is not configured');
  const response = await fetch(`${url}/rest/v1/${path}${query}`, {
    method,
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
