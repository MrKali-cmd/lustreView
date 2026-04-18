const {
  getMailConfigError,
  sendMail
} = require('../_lib/mail');
const { requireAdminAuth } = require('../_lib/admin-auth');
const {
  getMessages,
  handleOptions,
  readJson,
  sendJson,
  upsertMessage
} = require('../_lib/store');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  if (req.method === 'GET') {
    if (!requireAdminAuth(req, res)) return;
    sendJson(res, 200, await getMessages());
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
    const name = String(payload.name || '').trim();
    const phone = String(payload.phone || '').trim();
    const email = String(payload.email || payload.phone || '').trim();
    const roomType = String(payload.roomType || payload.room_type || '').trim();
    const message = String(payload.message || '').trim();
    const source = String(payload.source || 'website').trim();

    if (!name || !phone || !message) {
      sendJson(res, 400, { error: 'Missing required fields' });
      return;
    }

    const row = {
      id: String(payload.id || `msg-${Date.now()}`),
      name,
      phone,
      email,
      roomType,
      message,
      status: 'New',
      source,
      replyMessage: '',
      repliedAt: '',
      createdAt: now,
      updatedAt: now
    };

    await upsertMessage(row);

    // Optional: email admin when configured. If not configured, we still accept the message.
    const mailConfigError = getMailConfigError();
    if (!mailConfigError) {
      try {
        await sendMail({
          to: process.env.MAIL_FROM || process.env.SMTP_USER,
          subject: `New contact message: ${name}`,
          html: `
            <h2>New Contact Message</h2>
            <ul>
              <li><strong>Name:</strong> ${name}</li>
              <li><strong>Email:</strong> ${email}</li>
              <li><strong>Phone:</strong> ${phone}</li>
              <li><strong>Room:</strong> ${roomType}</li>
              <li><strong>Source:</strong> ${source}</li>
            </ul>
            <p style="white-space: pre-wrap;">${message}</p>
          `
        });
      } catch {
        // Ignore email failures; the message is already stored for the admin panel.
      }
    }

    sendJson(res, 201, row);
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};

