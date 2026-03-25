const {
  buildSessionCookie,
  clearFailedLoginAttempts,
  credentialsMatch,
  isLoginConfigured,
  recordFailedLoginAttempt
} = require('../_lib/admin-auth');
const {
  handleOptions,
  readJson,
  sendJson
} = require('../_lib/store');

module.exports = async (req, res) => {
  try {
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

    const payload = await readJson(req);
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
    sendJson(res, 200, {
      ok: true,
      redirectTo: '/admin/tailadmin-free-tailwind-dashboard-template-main/src/index.html'
    });
  } catch (error) {
    console.error('[admin/login] unexpected error:', error);
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: `Login handler error: ${error?.message || 'Unexpected failure'}`
      });
    }
  }
};
