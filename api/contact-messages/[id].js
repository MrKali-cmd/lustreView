const {
  requireAdminAuth
} = require('../_lib/admin-auth');
const {
  deleteMessage,
  getMessages,
  handleOptions,
  readJson,
  sendJson,
  upsertMessage
} = require('../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  const { id } = req.query || {};
  if (!id) {
    sendJson(res, 400, { error: 'Missing message id' });
    return;
  }

  if (req.method === 'GET') {
    if (!requireAdminAuth(req, res)) return;
    const row = getMessages().find((item) => item.id === id);
    if (!row) {
      sendJson(res, 404, { error: 'Message not found' });
      return;
    }
    sendJson(res, 200, row);
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    if (!requireAdminAuth(req, res)) return;
    const payload = await readJson(req);
    const existing = getMessages().find((item) => item.id === id);
    if (!existing) {
      sendJson(res, 404, { error: 'Message not found' });
      return;
    }

    const row = {
      id,
      name: payload.name !== undefined ? String(payload.name).trim() : existing.name,
      phone: payload.phone !== undefined ? String(payload.phone).trim() : existing.phone,
      email: payload.email !== undefined ? String(payload.email).trim() : existing.email,
      roomType: payload.roomType !== undefined ? String(payload.roomType).trim() : existing.roomType,
      message: payload.message !== undefined ? String(payload.message).trim() : existing.message,
      status: payload.status !== undefined ? String(payload.status).trim() : existing.status,
      source: payload.source !== undefined ? String(payload.source).trim() : existing.source,
      replyMessage: existing.replyMessage || '',
      repliedAt: existing.repliedAt || '',
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };

    upsertMessage(row);
    sendJson(res, 200, row);
    return;
  }

  if (req.method === 'DELETE') {
    if (!requireAdminAuth(req, res)) return;
    deleteMessage(id);
    sendJson(res, 204, {});
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};
