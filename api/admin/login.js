const {
  buildSessionCookie,
  clearFailedLoginAttempts,
  credentialsMatch,
  isLoginConfigured,
  recordFailedLoginAttempt
} = require('../../server/_lib/admin-auth');

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(payload || {}));
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!isLoginConfigured()) {
    sendJson(res, 500, {
      error: 'Admin login is not configured. Set ADMIN_LOGIN_USER, ADMIN_PASSWORD, and ADMIN_SESSION_TOKEN.'
    });
    return;
  }

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const identifier = String(payload.identifier || payload.email || payload.username || '').trim();
  const password = String(payload.password || '').trim();

  if (!identifier || !password) {
    sendJson(res, 400, { error: 'Missing credentials' });
    return;
  }

  if (!credentialsMatch(identifier, password)) {
    recordFailedLoginAttempt(req);
    sendJson(res, 401, { error: 'Invalid username or password' });
    return;
  }

  clearFailedLoginAttempts(req);
  const cookie = buildSessionCookie(req);
  if (!cookie) {
    sendJson(res, 500, { error: 'Admin session token is missing' });
    return;
  }

  res.setHeader('Set-Cookie', cookie);
  sendJson(res, 200, { ok: true, redirectTo: '/admin/panel/index.html' });
};

