const {
  isAdminSessionValid
} = require('../../_lib/admin-auth');
const {
  handleOptions,
  sendJson
} = require('../../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

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
