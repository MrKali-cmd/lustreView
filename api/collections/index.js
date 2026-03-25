const {
  getCollections,
  handleOptions,
  readJson,
  sendJson,
  upsertCollection
} = require('../_lib/store');
const {
  requireAdminAuth
} = require('../_lib/admin-auth');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  if (req.method === 'GET') {
    sendJson(res, 200, getCollections());
    return;
  }

  if (req.method === 'POST') {
    if (!requireAdminAuth(req, res)) return;
    const payload = await readJson(req);
    const now = new Date().toISOString().slice(0, 10);
    const row = {
      id: payload.id || `col-${Date.now()}`,
      name: String(payload.name || '').trim(),
      label: String(payload.label || '').trim(),
      tags: String(payload.tags || '').trim(),
      type: String(payload.type || '').trim(),
      status: String(payload.status || 'Draft').trim(),
      price: Number(payload.price) || 0,
      popular: Number(payload.popular) || 0,
      rating: Number(payload.rating) || 0,
      badge: String(payload.badge || '').trim(),
      image: String(payload.image || '').trim(),
      description: String(payload.description || '').trim(),
      updatedAt: payload.updatedAt || now
    };

    if (!row.name || !row.label || !row.tags || !row.type || !row.image || !row.description) {
      sendJson(res, 400, { error: 'Missing required fields' });
      return;
    }

    upsertCollection(row);
    sendJson(res, 201, row);
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};
