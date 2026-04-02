const {
  requireAdminAuth
} = require('../../_lib/admin-auth');
const {
  getMailConfigError,
  sendMail
} = require('../../_lib/mail');
const {
  escapeHtml,
  getMessages,
  handleOptions,
  readJson,
  sendJson,
  upsertMessage
} = require('../../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  if (!requireAdminAuth(req, res)) return;

  const { id } = req.query || {};
  if (!id) {
    sendJson(res, 400, { error: 'Missing message id' });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const payload = await readJson(req);
  const existing = (await getMessages()).find((item) => item.id === id);
  const fallbackMessage = payload.messageData && typeof payload.messageData === 'object'
    ? payload.messageData
    : null;

  const replyMessage = String(payload.reply || '').trim();
  if (!replyMessage) {
    sendJson(res, 400, { error: 'Reply text is required' });
    return;
  }

  const sourceMessage = existing || fallbackMessage;

  if (!sourceMessage) {
    sendJson(res, 404, { error: 'Message not found' });
    return;
  }

  const recipient = String(sourceMessage.email || sourceMessage.phone || '').trim();
  if (!recipient || !recipient.includes('@')) {
    sendJson(res, 400, { error: 'Recipient email is missing or invalid' });
    return;
  }

  const replySubject = payload.subject
    ? String(payload.subject).trim()
    : `Reply from Luxe Drapes for ${sourceMessage.roomType || 'your request'}`;

  const replyHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #222;">
      <h2 style="margin: 0 0 16px;">Luxe Drapes</h2>
      <p>Hello ${escapeHtml(sourceMessage.name)},</p>
      <p>${escapeHtml(replyMessage).replace(/\n/g, '<br>')}</p>
      <p style="margin-top: 24px;">Best regards,<br>Luxe Drapes team</p>
    </div>
  `;

  const replyText = `Hello ${sourceMessage.name},\n\n${replyMessage}\n\nBest regards,\nLuxe Drapes team`;
  const emailWarning = getMailConfigError();
  let emailDelivered = false;

  if (!emailWarning) {
    try {
      const delivery = await sendMail({
        to: recipient,
        subject: replySubject,
        html: replyHtml,
        text: replyText
      });
      emailDelivered = delivery.delivered;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Failed to send email' });
      return;
    }
  }

  const updated = {
    ...(existing || fallbackMessage || {}),
    id,
    name: sourceMessage.name || 'Unknown',
    email: recipient,
    phone: sourceMessage.phone || recipient,
    roomType: sourceMessage.roomType || sourceMessage.room_type || '',
    message: sourceMessage.message || '',
    status: 'Replied',
    replyMessage,
    repliedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await upsertMessage(updated);

  sendJson(res, 200, {
    ...updated,
    emailDelivered,
    emailWarning
  });
};
