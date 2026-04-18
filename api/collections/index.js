const { requireAdminAuth } = require('../_lib/admin-auth');
const {
  getCollections,
  handleOptions,
  readJson,
  sendJson,
  upsertCollection
} = require('../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  // Collections are managed from the admin panel only.
  if (!requireAdminAuth(req, res)) return;

  if (req.method === 'GET') {
    sendJson(res, 200, await getCollections());
    return;
  }

  if (req.method === 'POST') {
    let payload = {};
    try {
      payload = await readJson(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON payload' });
      return;
    }

    const now = new Date().toISOString();
    const row = {
      id: String(payload.id || `col-${Date.now()}`),
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
      updatedAt: String(payload.updatedAt || now).trim()
    };

    if (!row.name || !row.label) {
      sendJson(res, 400, { error: 'Missing required collection fields' });
      return;
    }

    await upsertCollection(row);
    sendJson(res, 201, row);
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};

