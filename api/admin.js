const {
  buildSessionCookie,
  clearFailedLoginAttempts,
  clearSessionCookie,
  credentialsMatch,
  isAdminSessionValid,
  isLoginConfigured,
  recordFailedLoginAttempt
} = require('./_lib/admin-auth');
const {
  handleOptions,
  readJson,
  sendJson
} = require('./_lib/store');

const getActionFromPath = (req) => {
  try {
    const host = req.headers?.host || 'localhost';
    const url = new URL(req.url || '', `http://${host}`);
    const suffix = url.pathname.replace(/^\/api\/admin\/?/, '');
    const action = (suffix.split('/').filter(Boolean)[0] || '').toLowerCase();
    return action;
  } catch {
    return '';
  }
};

module.exports = async (req, res) => {
  try {
    if (handleOptions(req, res)) return;

    const action = getActionFromPath(req);

    if (action === 'login') {
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
      sendJson(res, 200, { ok: true, redirectTo: '/admin/panel/index.html' });
      return;
    }

    if (action === 'logout') {
      if (req.method !== 'POST' && req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      res.setHeader('Set-Cookie', clearSessionCookie(req));
      sendJson(res, 200, { ok: true });
      return;
    }

    if (action === 'me') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      if (!isAdminSessionValid(req)) {
        sendJson(res, 401, { authenticated: false });
        return;
      }

      sendJson(res, 200, { authenticated: true });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[api/admin] unexpected error:', error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: error?.message || 'Unexpected failure' });
    }
  }
};

