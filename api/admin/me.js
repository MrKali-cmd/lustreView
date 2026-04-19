const { isAdminSessionValid } = require('../../server/_lib/admin-auth');

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

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!isAdminSessionValid(req)) {
    sendJson(res, 401, { authenticated: false });
    return;
  }

  sendJson(res, 200, { authenticated: true });
};
