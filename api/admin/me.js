const {
  isAdminSessionValid
} = require('../../_lib/admin-auth');
const {
  handleOptions,
  sendJson
} = require('../../_lib/store');

module.exports = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('[admin/me] unexpected error:', error);
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: `Session check error: ${error?.message || 'Unexpected failure'}`
      });
    }
  }
};
