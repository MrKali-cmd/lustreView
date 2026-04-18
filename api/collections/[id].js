const { requireAdminAuth } = require('../_lib/admin-auth');
const {
  handleOptions,
  readJson,
  sendJson,
  deleteCollection,
  upsertCollection
} = require('../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdminAuth(req, res)) return;

  const id = String(req.query?.id || '').trim();
  if (!id) {
    sendJson(res, 400, { error: 'Missing collection id' });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    let payload = {};
    try {
      payload = await readJson(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON payload' });
      return;
    }

    const now = new Date().toISOString();
    const row = {
      id,
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
    sendJson(res, 200, row);
    return;
  }

  if (req.method === 'DELETE') {
    await deleteCollection(id);
    sendJson(res, 204, null);
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};

