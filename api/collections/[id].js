const {
  requireAdminAuth
} = require('../_lib/admin-auth');
const {
  deleteCollection,
  getCollections,
  handleOptions,
  readJson,
  sendJson,
  upsertCollection
} = require('../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  const { id } = req.query || {};
  if (!id) {
    sendJson(res, 400, { error: 'Missing collection id' });
    return;
  }

  if (req.method === 'GET') {
    const row = getCollections().find((item) => item.id === id);
    if (!row) {
      sendJson(res, 404, { error: 'Collection not found' });
      return;
    }
    sendJson(res, 200, row);
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    if (!requireAdminAuth(req, res)) return;
    const payload = await readJson(req);
    const existing = getCollections().find((item) => item.id === id) || {};
    const now = new Date().toISOString().slice(0, 10);
    const row = {
      id,
      name: payload.name !== undefined ? String(payload.name).trim() : existing.name || '',
      label: payload.label !== undefined ? String(payload.label).trim() : existing.label || '',
      tags: payload.tags !== undefined ? String(payload.tags).trim() : existing.tags || '',
      type: payload.type !== undefined ? String(payload.type).trim() : existing.type || '',
      status: payload.status !== undefined ? String(payload.status).trim() : existing.status || 'Draft',
      price: payload.price !== undefined ? Number(payload.price) || 0 : Number(existing.price) || 0,
      popular: payload.popular !== undefined ? Number(payload.popular) || 0 : Number(existing.popular) || 0,
      rating: payload.rating !== undefined ? Number(payload.rating) || 0 : Number(existing.rating) || 0,
      badge: payload.badge !== undefined ? String(payload.badge).trim() : existing.badge || '',
      image: payload.image !== undefined ? String(payload.image).trim() : existing.image || '',
      description: payload.description !== undefined ? String(payload.description).trim() : existing.description || '',
      updatedAt: payload.updatedAt || now
    };

    upsertCollection(row);
    sendJson(res, 200, row);
    return;
  }

  if (req.method === 'DELETE') {
    if (!requireAdminAuth(req, res)) return;
    deleteCollection(id);
    sendJson(res, 204, {});
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};
