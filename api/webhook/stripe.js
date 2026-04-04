const { getStripe, hasStripe } = require('../_lib/stripe');
const { getOrders, sendJson, upsertOrder } = require('../_lib/store');

const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!hasStripe()) {
    sendJson(res, 500, { error: 'Stripe is not configured' });
    return;
  }

  const signature = req.headers['stripe-signature'];
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!signature || !webhookSecret) {
    sendJson(res, 500, { error: 'Stripe webhook secret is missing' });
    return;
  }

  try {
    const stripe = getStripe();
    const rawBody = await readRawBody(req);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = String(session.metadata?.orderId || '').trim();
      if (orderId) {
        const orders = await getOrders();
        const existing = orders.find((item) => item.id === orderId);
        if (existing) {
          await upsertOrder({
            ...existing,
            paymentMethod: 'Stripe card payment',
            status: 'Processing',
            updatedAt: new Date().toISOString()
          });
        }
      }
    }

    sendJson(res, 200, { received: true });
  } catch (error) {
    sendJson(res, 400, { error: `Webhook Error: ${error.message}` });
  }
};
