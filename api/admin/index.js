const { handleOptions, sendJson } = require('../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  sendJson(res, 404, { error: 'Not found' });
};

