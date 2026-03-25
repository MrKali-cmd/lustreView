const {
  getMailConfigError,
  sendMail
} = require('../_lib/mail');
const {
  requireAdminAuth
} = require('../_lib/admin-auth');
const {
  getMessages,
  handleOptions,
  readJson,
  sendJson,
  upsertMessage
} = require('../_lib/store');

const gmailPattern = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  if (req.method === 'GET') {
    if (!requireAdminAuth(req, res)) return;
    sendJson(res, 200, getMessages());
    return;
  }

  if (req.method === 'POST') {
    const payload = await readJson(req);
    const now = new Date().toISOString();
    const name = String(payload.name || '').trim();
    const email = String(payload.email || payload.phone || '').trim();
    const roomType = String(payload.roomType || '').trim();
    const message = String(payload.message || '').trim();
    const source = String(payload.source || 'website').trim();

    if (!name || !email || !roomType || !message) {
      sendJson(res, 400, { error: 'Missing required fields' });
      return;
    }

    if (!gmailPattern.test(email)) {
      sendJson(res, 400, { error: 'Only Gmail addresses are allowed' });
      return;
    }

    const row = {
      id: `msg-${Date.now()}`,
      name,
      phone: email,
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

    upsertMessage(row);

    const mailWarning = getMailConfigError();
    let emailDelivered = false;

    if (!mailWarning) {
      try {
        const adminRecipient = process.env.SMTP_USER || process.env.MAIL_FROM;
        if (adminRecipient) {
          const delivery = await sendMail({
            to: adminRecipient,
            subject: `New contact request from ${name}`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #222;">
                <h2 style="margin: 0 0 16px;">Luxe Drapes - New Request</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Room Type:</strong> ${roomType}</p>
                <p><strong>Message:</strong><br>${message.replace(/\n/g, '<br>')}</p>
              </div>
            `,
            text: `New contact request from ${name}\n\nEmail: ${email}\nRoom Type: ${roomType}\n\n${message}`
          });
          emailDelivered = delivery.delivered;
        }
      } catch (error) {
        // Keep the API successful even if notification email fails.
      }
    }

    sendJson(res, 201, {
      ...row,
      emailDelivered,
      emailWarning: mailWarning
    });
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};
