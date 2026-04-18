const { requireAdminAuth } = require('../_lib/admin-auth');
const {
  deleteMessage,
  getMessages,
  handleOptions,
  readJson,
  sendJson,
  upsertMessage
} = require('../_lib/store');

const normalizeId = (req) => String(req.query?.id || '').trim();

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  const id = normalizeId(req);
  if (!id) {
    sendJson(res, 400, { error: 'Missing message id' });
    return;
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    if (!requireAdminAuth(req, res)) return;

    let payload = {};
    try {
      payload = await readJson(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON payload' });
      return;
    }

    // Try to merge with existing message to keep fields stable when admin only updates status.
    const existing = (await getMessages()).find((msg) => String(msg.id) === id);

    const now = new Date().toISOString();
    const row = {
      id,
      name: String(payload.name ?? existing?.name ?? '').trim(),
      phone: String(payload.phone ?? existing?.phone ?? '').trim(),
      email: String(payload.email ?? existing?.email ?? existing?.phone ?? '').trim(),
      roomType: String(payload.roomType ?? payload.room_type ?? existing?.roomType ?? '').trim(),
      message: String(payload.message ?? existing?.message ?? '').trim(),
      status: String(payload.status ?? existing?.status ?? 'New').trim(),
      source: String(payload.source ?? existing?.source ?? 'admin-panel').trim(),
      replyMessage: String(payload.replyMessage ?? existing?.replyMessage ?? '').trim(),
      repliedAt: String(payload.repliedAt ?? existing?.repliedAt ?? '').trim(),
      createdAt: String(existing?.createdAt ?? now).trim(),
      updatedAt: now
    };

    if (!row.name || !row.phone || !row.message) {
      sendJson(res, 400, { error: 'Missing required message fields' });
      return;
    }

    await upsertMessage(row);
    sendJson(res, 200, row);
    return;
  }

  if (req.method === 'DELETE') {
    if (!requireAdminAuth(req, res)) return;
    await deleteMessage(id);
    res.statusCode = 204;
    res.end();
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};

