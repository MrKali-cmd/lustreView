const nodemailer = require('nodemailer');

const DEFAULT_SITE_FROM = 'Luxe Drapes <info@lustreview.com>';

const getMailConfigError = () => {
  const missing = [];
  if (!process.env.SMTP_HOST) missing.push('SMTP_HOST');
  if (!process.env.SMTP_USER) missing.push('SMTP_USER');
  if (!process.env.SMTP_PASS) missing.push('SMTP_PASS');

  if (missing.length) {
    return `SMTP is not configured. Missing: ${missing.join(', ')}.`;
  }

  return '';
};

const createTransport = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
};

const sendMail = async ({ to, subject, html, text }) => {
  const transport = createTransport();

  if (!transport) {
    return {
      delivered: false,
      reason: getMailConfigError()
    };
  }

  const configuredFrom = String(process.env.MAIL_FROM || '').trim();
  const fromAddress = configuredFrom && !configuredFrom.toLowerCase().includes('gmail.com')
    ? configuredFrom
    : DEFAULT_SITE_FROM;
  await transport.sendMail({
    from: fromAddress,
    to,
    subject,
    html,
    text
  });

  return {
    delivered: true,
    reason: ''
  };
};

module.exports = {
  getMailConfigError,
  sendMail
};
