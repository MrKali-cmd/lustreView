const app = require('../../server/server');

module.exports = (req, res) => {
  // Vercel dynamic functions expose the segment as req.query.id, but our Express
  // routes expect the full `/api/collections/:id` path.
  const id = String((req.query && req.query.id) || '').trim();
  if (id) {
    const originalUrl = String(req.url || '');
    const qsIndex = originalUrl.indexOf('?');
    const query = qsIndex >= 0 ? originalUrl.slice(qsIndex) : '';
    req.url = `/api/collections/${encodeURIComponent(id)}${query}`;
  }

  return app(req, res);
};

