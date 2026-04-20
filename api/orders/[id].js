const app = require('../../server/server');

module.exports = (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  if (id) {
    const originalUrl = String(req.url || '');
    const qsIndex = originalUrl.indexOf('?');
    const query = qsIndex >= 0 ? originalUrl.slice(qsIndex) : '';
    req.url = `/api/orders/${encodeURIComponent(id)}${query}`;
  }

  return app(req, res);
};

