const { getBaseUrl, getStripe, hasStripe } = require('../_lib/stripe');
const { handleOptions, readJson, sendJson, upsertOrder } = require('../_lib/store');

const USD_RATE = 42000;

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!hasStripe()) {
    sendJson(res, 500, {
      error: 'Stripe is not configured. Set STRIPE_SECRET_KEY before enabling online card payments.'
    });
    return;
  }

  const payload = await readJson(req);
  const now = new Date().toISOString();
  const customerName = String(payload.customerName || '').trim();
  const email = String(payload.email || '').trim();
  const phone = String(payload.phone || '').trim();
  const paymentMethod = String(payload.paymentMethod || '').trim();
  const shippingAddress = String(payload.shippingAddress || '').trim();
  const city = String(payload.city || '').trim();
  const notes = String(payload.notes || '').trim();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const subtotal = Number(payload.subtotal) || 0;
  const shippingFee = Number(payload.shippingFee) || 0;
  const total = Number(payload.total) || 0;

  if (!customerName || !email || !phone || !shippingAddress || !city || !items.length) {
    sendJson(res, 400, { error: 'Missing required checkout fields' });
    return;
  }

  const order = {
    id: `ord-${Date.now()}`,
    customerName,
    email,
    phone,
    paymentMethod,
    shippingAddress,
    city,
    notes,
    status: 'Pending',
    currency: 'USD',
    subtotal,
    shippingFee,
    total,
    items,
    createdAt: now,
    updatedAt: now
  };

  await upsertOrder(order);

  const stripe = getStripe();
  const baseUrl = getBaseUrl(req);
  const lineItems = items.map((item) => ({
    quantity: 1,
    price_data: {
      currency: 'usd',
      product_data: {
        name: String(item.name || 'Curtain item'),
        images: item.image ? [String(item.image)] : undefined
      },
      unit_amount: Math.max(50, Math.round((Number(item.price || 0) / USD_RATE) * 100))
    }
  }));

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    line_items: lineItems,
    metadata: {
      orderId: order.id,
      customerName,
      phone,
      city,
      paymentMethod
    },
    success_url: `${baseUrl}/order-success.html?order=${encodeURIComponent(order.id)}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/checkout.html?payment=cancelled&order=${encodeURIComponent(order.id)}`
  });

  sendJson(res, 200, {
    url: session.url,
    order: {
      ...order,
      stripeSessionId: session.id
    }
  });
};
