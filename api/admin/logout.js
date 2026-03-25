const {
  clearSessionCookie
} = require('../../_lib/admin-auth');
const {
  handleOptions,
  sendJson
} = require('../../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST' && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  res.setHeader('Set-Cookie', clearSessionCookie(req));
  sendJson(res, 200, { ok: true });
};
