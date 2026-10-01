const { json, readBody, verifyTelegram, isOwner, rpc, publicUser } = require('./_lib');

module.exports = async function handler(req, res) {
  try {
    const user = verifyTelegram(req.headers['x-telegram-init-data']);
    if (!isOwner(user)) return json(res, 403, { ok: false, error: 'Owner access required' });
    const body = req.method === 'POST' ? await readBody(req) : {};
    const action = req.method === 'GET' ? 'overview' : String(body.action || 'overview');
    const allowed = new Set(['overview', 'grant_coins', 'grant_item', 'set_blocked', 'create_promo', 'set_config', 'create_tournament']);
    if (!allowed.has(action)) return json(res, 400, { ok: false, error: 'Unknown admin action' });
    const data = await rpc('admin_action', {
      p_admin: publicUser(user),
      p_action: action,
      p_payload: body.payload || {}
    });
    return json(res, 200, { ok: true, data });
  } catch (error) {
    const status = /signature|session|authorization/i.test(error.message) ? 401 : /not configured/i.test(error.message) ? 503 : 400;
    return json(res, status, { ok: false, error: error.message });
  }
};
