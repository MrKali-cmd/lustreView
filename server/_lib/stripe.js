const Stripe = require('stripe');

let stripeClient = null;

const getStripe = () => {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
};

const getBaseUrl = (req) => {
  const configured =
    String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;

  const protocol =
    String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() ||
    (req.connection && req.connection.encrypted ? 'https' : 'http');
  const host =
    String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();

  return `${protocol}://${host}`;
};

const hasStripe = () => Boolean(getStripe());

module.exports = {
  getBaseUrl,
  getStripe,
  hasStripe
};

