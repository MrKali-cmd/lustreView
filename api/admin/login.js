const {
  buildSessionCookie,
  clearFailedLoginAttempts,
  credentialsMatch,
  getLoginBlockedMessage,
  isLoginConfigured,
  isLoginBlocked,
  recordFailedLoginAttempt
} = require('../../_lib/admin-auth');
const {
  handleOptions,
  readJson,
  sendJson
} = require('../../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

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

  if (isLoginBlocked(req)) {
    sendJson(res, 429, {
      error: getLoginBlockedMessage(req) || 'Too many failed login attempts. Try again later.'
    });
    return;
  }

  const payload = await readJson(req);
  const identifier = String(payload.identifier || payload.email || payload.username || '').trim();
  const password = String(payload.password || '').trim();

  if (!identifier || !password) {
    sendJson(res, 400, { error: 'Missing credentials' });
    return;
  }

  if (!credentialsMatch(identifier, password)) {
    const lockState = recordFailedLoginAttempt(req);
    if (lockState && lockState.lockedUntil && lockState.lockedUntil > Date.now()) {
      sendJson(res, 429, {
        error: getLoginBlockedMessage(req) || 'Too many failed login attempts. Try again later.'
      });
      return;
    }

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
  sendJson(res, 200, {
    ok: true,
    redirectTo: '/admin/tailadmin-free-tailwind-dashboard-template-main/src/index.html'
  });
};
