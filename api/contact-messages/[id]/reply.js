const { requireAdminAuth } = require('../../_lib/admin-auth');
const {
  getMailConfigError,
  sendMail
} = require('../../_lib/mail');
const {
  getMessages,
  handleOptions,
  readJson,
  sendJson,
  upsertMessage
} = require('../../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdminAuth(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const id = String(req.query?.id || '').trim();
  if (!id) {
    sendJson(res, 400, { error: 'Missing message id' });
    return;
  }

  let payload = {};
  try {
    payload = await readJson(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON payload' });
    return;
  }

  const reply = String(payload.reply || '').trim();
  const subject = String(payload.subject || '').trim();
  if (!reply) {
    sendJson(res, 400, { error: 'Reply text is required' });
    return;
  }

  const existing = (await getMessages()).find((msg) => String(msg.id) === id);
  if (!existing) {
    sendJson(res, 404, { error: 'Message not found' });
    return;
  }

  const recipient = String(existing.email || '').trim();
  if (!recipient || !recipient.includes('@')) {
    sendJson(res, 400, { error: 'Recipient email is missing or invalid' });
    return;
  }

  let emailDelivered = false;
  let emailWarning = getMailConfigError();

  if (!emailWarning) {
    try {
      await sendMail({
        to: recipient,
        subject: subject || `Reply from Luxe Drapes`,
        html: `
          <h2>Luxe Drapes</h2>
          <p>Hello ${existing.name || ''},</p>
          <p style="white-space: pre-wrap;">${reply}</p>
          <p style="margin-top: 20px;">Best regards,<br/>Luxe Drapes team</p>
        `
      });
      emailDelivered = true;
    } catch (error) {
      emailWarning = error?.message || 'Failed to send email';
    }
  }

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    status: 'Replied',
    replyMessage: reply,
    repliedAt: now,
    updatedAt: now
  };

  await upsertMessage(updated);
  sendJson(res, 200, { ...updated, emailDelivered, emailWarning });
};

