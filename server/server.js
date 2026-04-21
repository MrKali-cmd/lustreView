const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const adminAuth = require('./_lib/admin-auth');
const mail = require('./_lib/mail');
const stripeLib = require('./_lib/stripe');

const app = express();
const PORT = process.env.PORT || 3000;

const sql = String(process.env.DATABASE_URL || '').trim()
  ? neon(process.env.DATABASE_URL)
  : null;

app.use(cors());
app.use(express.json());

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (payload === null || payload === undefined) {
    res.end();
    return;
  }
  res.end(JSON.stringify(payload));
};

const handleOptions = (req, res) => {
  if (req.method !== 'OPTIONS') return false;
  res.statusCode = 204;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end();
  return true;
};

const parseCookies = (headerValue) => {
  const cookies = {};
  String(headerValue || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index < 0) return;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      cookies[name] = decodeURIComponent(value);
    });
  return cookies;
};

const SITE_SESSION_COOKIE = 'luxe_site_session';
const getSiteSessionId = (req) => {
  const cookies = parseCookies(req.headers?.cookie || req.headers?.Cookie || '');
  return String(cookies[SITE_SESSION_COOKIE] || '').trim();
};
const ensureSiteSessionId = (req, res) => {
  const existing = getSiteSessionId(req);
  if (existing) return existing;
  const id = `sess-${crypto.randomBytes(16).toString('hex')}`;
  res.setHeader(
    'Set-Cookie',
    `${SITE_SESSION_COOKIE}=${encodeURIComponent(id)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
  return id;
};

let tablesReady = false;
const ensureTables = async () => {
  if (tablesReady) return;
  if (!sql) return;

  await sql.query(`
    CREATE TABLE IF NOT EXISTS site_sessions (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      label TEXT NOT NULL,
      tags TEXT DEFAULT '',
      type TEXT DEFAULT '',
      status TEXT DEFAULT 'Draft',
      price NUMERIC DEFAULT 0,
      popular NUMERIC DEFAULT 0,
      rating NUMERIC DEFAULT 0,
      badge TEXT DEFAULT '',
      image TEXT DEFAULT '',
      description TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    )
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      room_type TEXT DEFAULT '',
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT DEFAULT 'website',
      reply_message TEXT DEFAULT '',
      replied_at TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      shipping_address TEXT NOT NULL,
      city TEXT NOT NULL,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL,
      currency TEXT NOT NULL,
      subtotal NUMERIC NOT NULL,
      shipping_fee NUMERIC NOT NULL,
      total NUMERIC NOT NULL,
      items_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      service_type TEXT NOT NULL,
      preferred_date TEXT NOT NULL,
      preferred_time TEXT NOT NULL,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL,
      source TEXT DEFAULT 'website',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      email TEXT DEFAULT '',
      rating NUMERIC NOT NULL,
      comment TEXT NOT NULL,
      order_id TEXT DEFAULT '',
      status TEXT DEFAULT 'Approved',
      source TEXT DEFAULT 'website',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      edit_token TEXT DEFAULT ''
    )
  `);

  await sql.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await sql.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS edit_token TEXT DEFAULT ''`);

  tablesReady = true;
};

const requireDatabase = async (req, res) => {
  const hasDbEnv = Boolean(String(process.env.DATABASE_URL || '').trim());
  if (!sql) {
    sendJson(res, 503, {
      error: hasDbEnv
        ? 'Database client was not initialized.'
        : 'Database is not configured. Set DATABASE_URL in your environment variables.'
    });
    return false;
  }
  try {
    await ensureTables();
    return true;
  } catch (error) {
    // Log full error in Vercel logs for debugging.
    // eslint-disable-next-line no-console
    console.error('[db] connection/table init failed:', error);
    sendJson(res, 503, {
      error: 'Database is not reachable. Check DATABASE_URL and Neon availability.',
      detail: String(error && (error.message || error.toString()) || 'unknown').slice(0, 180)
    });
    return false;
  }
};

const requireAdmin = (req, res) => {
  if (adminAuth.isAdminSessionValid(req)) return true;
  sendJson(res, 401, { error: 'Unauthorized' });
  return false;
};

// Lightweight endpoint to verify the API is deployed and reachable (no DB required).
app.get('/api/ping', (req, res) => {
  if (handleOptions(req, res)) return;
  sendJson(res, 200, {
    ok: true,
    now: new Date().toISOString(),
    hasDatabaseEnv: Boolean(String(process.env.DATABASE_URL || '').trim()),
    commit: String(process.env.VERCEL_GIT_COMMIT_SHA || ''),
    ref: String(process.env.VERCEL_GIT_COMMIT_REF || ''),
    deployment: String(process.env.VERCEL_DEPLOYMENT_ID || '')
  });
});

// Debug-only: check DB connectivity and return the underlying error details.
// Protected behind admin auth to avoid leaking internal information publicly.
app.get('/api/_debug/db', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const hasDbEnv = Boolean(String(process.env.DATABASE_URL || '').trim());
  if (!hasDbEnv || !sql) {
    sendJson(res, 503, {
      ok: false,
      error: hasDbEnv ? 'Database client was not initialized.' : 'DATABASE_URL is missing.'
    });
    return;
  }

  try {
    // Basic ping query.
    const rows = await sql.query('SELECT 1 as ok');
    sendJson(res, 200, { ok: true, rows });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[db-check] failed:', error);
    sendJson(res, 503, {
      ok: false,
      name: String(error?.name || ''),
      code: String(error?.code || ''),
      message: String(error?.message || error || '').slice(0, 400)
    });
  }
});

const mapCollection = (row) => ({
  id: row.id,
  name: row.name,
  label: row.label,
  tags: row.tags,
  type: row.type,
  status: row.status,
  price: Number(row.price) || 0,
  popular: Number(row.popular) || 0,
  rating: Number(row.rating) || 0,
  badge: row.badge,
  image: row.image,
  description: row.description,
  updatedAt: row.updated_at
});

const mapReview = (row) => ({
  id: row.id,
  customerName: row.customer_name,
  email: row.email || '',
  rating: Number(row.rating) || 0,
  comment: row.comment,
  orderId: row.order_id || '',
  status: row.status || 'Approved',
  source: row.source || 'website',
  createdAt: row.created_at,
  updatedAt: row.updated_at || row.created_at
});

const mapMessage = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email || row.phone,
  roomType: row.room_type,
  message: row.message,
  status: row.status,
  source: row.source,
  replyMessage: row.reply_message || '',
  repliedAt: row.replied_at || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapOrder = (row) => ({
  id: row.id,
  customerName: row.customer_name,
  email: row.email,
  phone: row.phone,
  paymentMethod: row.payment_method,
  shippingAddress: row.shipping_address,
  city: row.city,
  notes: row.notes || '',
  status: row.status,
  currency: row.currency,
  subtotal: Number(row.subtotal) || 0,
  shippingFee: Number(row.shipping_fee) || 0,
  total: Number(row.total) || 0,
  items: (() => {
    try {
      const parsed = JSON.parse(row.items_json || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })(),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapAppointment = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  serviceType: row.service_type,
  preferredDate: row.preferred_date,
  preferredTime: row.preferred_time,
  notes: row.notes || '',
  status: row.status,
  source: row.source,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// ---- Admin auth endpoints
app.post('/api/admin/login', async (req, res) => {
  if (handleOptions(req, res)) return;

  if (!adminAuth.isLoginConfigured()) {
    sendJson(res, 500, {
      error: 'Admin login is not configured. Set ADMIN_LOGIN_USER, ADMIN_PASSWORD, and ADMIN_SESSION_TOKEN.'
    });
    return;
  }

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const identifier = String(payload.identifier || payload.email || payload.username || '').trim();
  const password = String(payload.password || '').trim();

  if (!identifier || !password) {
    sendJson(res, 400, { error: 'Missing credentials' });
    return;
  }

  if (!adminAuth.credentialsMatch(identifier, password)) {
    adminAuth.recordFailedLoginAttempt(req);
    sendJson(res, 401, { error: 'Invalid username or password' });
    return;
  }

  adminAuth.clearFailedLoginAttempts(req);
  const cookie = adminAuth.buildSessionCookie(req);
  if (!cookie) {
    sendJson(res, 500, { error: 'Admin session token is missing' });
    return;
  }

  res.setHeader('Set-Cookie', cookie);
  sendJson(res, 200, { ok: true, redirectTo: '/admin/panel/index.html' });
});

app.get('/api/admin/me', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!adminAuth.isAdminSessionValid(req)) {
    sendJson(res, 401, { authenticated: false });
    return;
  }
  sendJson(res, 200, { authenticated: true });
});

app.all('/api/admin/logout', async (req, res) => {
  if (handleOptions(req, res)) return;
  res.setHeader('Set-Cookie', adminAuth.clearSessionCookie(req));
  sendJson(res, 200, { ok: true });
});

// ---- Session state (cart / wishlist / last order)
app.all('/api/session-state', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const sessionId = ensureSiteSessionId(req, res);

  const loadState = async () => {
    const rows = await sql.query('SELECT state_json FROM site_sessions WHERE id = $1', [sessionId]);
    const raw = rows?.[0]?.state_json;
    if (!raw) return { cart: [], wishlist: [], lastOrder: null };
    try {
      const parsed = JSON.parse(raw);
      return {
        cart: Array.isArray(parsed?.cart) ? parsed.cart : [],
        wishlist: Array.isArray(parsed?.wishlist) ? parsed.wishlist : [],
        lastOrder: parsed?.lastOrder && typeof parsed.lastOrder === 'object' ? parsed.lastOrder : null
      };
    } catch {
      return { cart: [], wishlist: [], lastOrder: null };
    }
  };

  const saveState = async (state) => {
    const now = new Date().toISOString();
    await sql.query(
      `INSERT INTO site_sessions (id, state_json, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = EXCLUDED.updated_at`,
      [sessionId, JSON.stringify(state), now]
    );
    return state;
  };

  if (req.method === 'GET') {
    sendJson(res, 200, await loadState());
    return;
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(payload.action || '').trim();
    const supportedActions = new Set([
      'add-cart',
      'remove-cart',
      'clear-cart',
      'add-wishlist',
      'remove-wishlist',
      'clear-wishlist',
      'move-to-cart',
      'move-to-wishlist',
      'set-last-order',
      'clear-last-order'
    ]);

    if (!action) {
      sendJson(res, 400, { error: 'Missing action' });
      return;
    }
    if (!supportedActions.has(action)) {
      sendJson(res, 400, { error: 'Unsupported action' });
      return;
    }

    const normalizeKey = (value) => String(value || '').trim();
    const getItemKey = (value) =>
      typeof value === 'object' && value ? normalizeKey(value.key) : normalizeKey(value);
    const normalizeCartItem = (value, fallbackKey = '') => {
      const key = normalizeKey(value?.key || value?.id || fallbackKey);
      if (!key) return null;
      return {
        key,
        width: Number(value?.width || 0),
        height: Number(value?.height || 0),
        estimatedPrice: Number(value?.estimatedPrice || 0),
        basePrice: Number(value?.basePrice || 0)
      };
    };

    const key = normalizeKey(payload.key || payload.itemKey);
    const item = normalizeCartItem(payload.item, key);

    const current = await loadState();
    const cart = (Array.isArray(current.cart) ? current.cart : []).reduce((map, entry) => {
      const entryKey = getItemKey(entry);
      if (entryKey) map.set(entryKey, typeof entry === 'object' && entry ? entry : { key: entryKey });
      return map;
    }, new Map());
    const wishlist = (Array.isArray(current.wishlist) ? current.wishlist : []).reduce((map, entry) => {
      const entryKey = getItemKey(entry);
      if (entryKey) map.set(entryKey, typeof entry === 'object' && entry ? entry : { key: entryKey });
      return map;
    }, new Map());
    let lastOrder = current.lastOrder && typeof current.lastOrder === 'object' ? current.lastOrder : null;

    const addItem = (map) => {
      if (item) map.set(item.key, item);
      else if (key) map.set(key, { key });
    };
    const removeItem = (map) => {
      if (key) map.delete(key);
      if (item?.key) map.delete(item.key);
    };

    switch (action) {
      case 'add-cart':
        addItem(cart);
        break;
      case 'remove-cart':
        removeItem(cart);
        break;
      case 'clear-cart':
        cart.clear();
        break;
      case 'add-wishlist':
        addItem(wishlist);
        break;
      case 'remove-wishlist':
        removeItem(wishlist);
        break;
      case 'clear-wishlist':
        wishlist.clear();
        break;
      case 'move-to-cart':
        removeItem(wishlist);
        addItem(cart);
        break;
      case 'move-to-wishlist':
        removeItem(cart);
        addItem(wishlist);
        break;
      case 'set-last-order':
        lastOrder = payload.order && typeof payload.order === 'object' ? payload.order : null;
        break;
      case 'clear-last-order':
        lastOrder = null;
        break;
    }

    const nextState = {
      cart: Array.from(cart.values()),
      wishlist: Array.from(wishlist.values()),
      lastOrder
    };
    sendJson(res, 200, await saveState(nextState));
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});

// ---- Collections (admin only for mutations; GET is used by zebra page too)
app.get('/api/collections', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  try {
    const rows = await sql.query('SELECT * FROM collections ORDER BY updated_at DESC');
    sendJson(res, 200, rows.map(mapCollection));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to load collections' });
  }
});

app.post('/api/collections', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const now = new Date().toISOString().slice(0, 10);
  const row = {
    id: String(payload.id || `col-${Date.now()}`),
    name: String(payload.name || '').trim(),
    label: String(payload.label || '').trim(),
    tags: String(payload.tags || '').trim(),
    type: String(payload.type || '').trim(),
    status: String(payload.status || 'Draft').trim(),
    price: Number(payload.price) || 0,
    popular: Number(payload.popular) || 0,
    rating: Number(payload.rating) || 0,
    badge: String(payload.badge || '').trim(),
    image: String(payload.image || '').trim(),
    description: String(payload.description || '').trim(),
    updated_at: String(payload.updatedAt || now).trim()
  };

  if (!row.name || !row.label) {
    sendJson(res, 400, { error: 'Missing required collection fields' });
    return;
  }

  try {
    await sql.query(
      `INSERT INTO collections (id, name, label, tags, type, status, price, popular, rating, badge, image, description, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name,
         label=EXCLUDED.label,
         tags=EXCLUDED.tags,
         type=EXCLUDED.type,
         status=EXCLUDED.status,
         price=EXCLUDED.price,
         popular=EXCLUDED.popular,
         rating=EXCLUDED.rating,
         badge=EXCLUDED.badge,
         image=EXCLUDED.image,
         description=EXCLUDED.description,
         updated_at=EXCLUDED.updated_at`,
      [
        row.id,
        row.name,
        row.label,
        row.tags,
        row.type,
        row.status,
        row.price,
        row.popular,
        row.rating,
        row.badge,
        row.image,
        row.description,
        row.updated_at
      ]
    );
    sendJson(res, 201, mapCollection(row));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to save collection' });
  }
});

app.put('/api/collections/:id', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const now = new Date().toISOString().slice(0, 10);
  const id = String(req.params.id || '').trim();

  try {
    if (!id) {
      sendJson(res, 400, { error: 'Missing required collection fields' });
      return;
    }

    const existingRows = await sql.query('SELECT * FROM collections WHERE id = $1', [id]);
    const existing = existingRows?.[0];
    if (!existing) {
      sendJson(res, 404, { error: 'Collection not found' });
      return;
    }

    const row = {
      id,
      name: String(payload.name ?? existing.name ?? '').trim(),
      label: String(payload.label ?? existing.label ?? '').trim(),
      tags: String(payload.tags ?? existing.tags ?? '').trim(),
      type: String(payload.type ?? existing.type ?? '').trim(),
      status: String(payload.status ?? existing.status ?? 'Draft').trim(),
      // Price is optional in admin UI now. Preserve existing value unless explicitly provided.
      price: payload.price === undefined ? Number(existing.price) || 0 : Number(payload.price) || 0,
      popular: payload.popular === undefined ? Number(existing.popular) || 0 : Number(payload.popular) || 0,
      rating: payload.rating === undefined ? Number(existing.rating) || 0 : Number(payload.rating) || 0,
      badge: String(payload.badge ?? existing.badge ?? '').trim(),
      image: String(payload.image ?? existing.image ?? '').trim(),
      description: String(payload.description ?? existing.description ?? '').trim(),
      updated_at: String(payload.updatedAt || now).trim()
    };

    if (!row.name || !row.label) {
      sendJson(res, 400, { error: 'Missing required collection fields' });
      return;
    }

    await sql.query(
      `UPDATE collections SET name=$1, label=$2, tags=$3, type=$4, status=$5, price=$6, popular=$7, rating=$8, badge=$9, image=$10, description=$11, updated_at=$12 WHERE id=$13`,
      [
        row.name,
        row.label,
        row.tags,
        row.type,
        row.status,
        row.price,
        row.popular,
        row.rating,
        row.badge,
        row.image,
        row.description,
        row.updated_at,
        row.id
      ]
    );
    sendJson(res, 200, mapCollection(row));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to update collection' });
  }
});

app.delete('/api/collections/:id', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  try {
    await sql.query('DELETE FROM collections WHERE id = $1', [req.params.id]);
    sendJson(res, 204, null);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to delete collection' });
  }
});

// ---- Contact messages
app.get('/api/contact-messages', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  try {
    const rows = await sql.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    sendJson(res, 200, rows.map(mapMessage));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to load messages' });
  }
});

app.post('/api/contact-messages', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const now = new Date().toISOString();

  const row = {
    id: String(payload.id || `msg-${Date.now()}`),
    name: String(payload.name || '').trim(),
    phone: String(payload.phone || payload.email || '').trim(),
    email: String(payload.email || payload.phone || '').trim(),
    room_type: String(payload.roomType || payload.room_type || '').trim(),
    message: String(payload.message || '').trim(),
    status: 'New',
    source: String(payload.source || 'website').trim(),
    reply_message: '',
    replied_at: '',
    created_at: now,
    updated_at: now
  };

  if (!row.name || !row.phone || !row.message) {
    sendJson(res, 400, { error: 'Missing required fields' });
    return;
  }

  try {
    await sql.query(
      `INSERT INTO contact_messages (id, name, phone, email, room_type, message, status, source, reply_message, replied_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        row.id,
        row.name,
        row.phone,
        row.email,
        row.room_type,
        row.message,
        row.status,
        row.source,
        row.reply_message,
        row.replied_at,
        row.created_at,
        row.updated_at
      ]
    );
    sendJson(res, 201, mapMessage(row));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to save message' });
  }
});

app.put('/api/contact-messages/:id', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const id = String(req.params.id || '').trim();

  try {
    const rows = await sql.query('SELECT * FROM contact_messages WHERE id = $1', [id]);
    const existing = rows?.[0];
    if (!existing) {
      sendJson(res, 404, { error: 'Message not found' });
      return;
    }

    const updated = {
      id,
      name: String(payload.name ?? existing.name ?? '').trim(),
      phone: String(payload.phone ?? existing.phone ?? '').trim(),
      email: String(payload.email ?? existing.email ?? '').trim(),
      room_type: String(payload.roomType ?? payload.room_type ?? existing.room_type ?? '').trim(),
      message: String(payload.message ?? existing.message ?? '').trim(),
      status: String(payload.status ?? existing.status ?? 'New').trim(),
      source: String(payload.source ?? existing.source ?? 'admin-panel').trim(),
      reply_message: String(existing.reply_message || ''),
      replied_at: String(existing.replied_at || ''),
      created_at: existing.created_at,
      updated_at: new Date().toISOString()
    };

    await sql.query(
      `UPDATE contact_messages SET name=$1, phone=$2, email=$3, room_type=$4, message=$5, status=$6, source=$7, updated_at=$8 WHERE id=$9`,
      [
        updated.name,
        updated.phone,
        updated.email,
        updated.room_type,
        updated.message,
        updated.status,
        updated.source,
        updated.updated_at,
        id
      ]
    );
    sendJson(res, 200, mapMessage(updated));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to update message' });
  }
});

app.delete('/api/contact-messages/:id', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  try {
    await sql.query('DELETE FROM contact_messages WHERE id = $1', [req.params.id]);
    sendJson(res, 204, null);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to delete message' });
  }
});

app.post('/api/contact-messages/:id/reply', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const id = String(req.params.id || '').trim();

  const replyMessage = String(payload.reply || '').trim();
  if (!replyMessage) {
    sendJson(res, 400, { error: 'Reply text is required' });
    return;
  }

  const rows = await sql.query('SELECT * FROM contact_messages WHERE id = $1', [id]);
  const existing = rows?.[0];
  if (!existing) {
    sendJson(res, 404, { error: 'Message not found' });
    return;
  }

  let emailDelivered = false;
  let emailWarning = mail.getMailConfigError();

  if (!emailWarning) {
    try {
      await mail.sendMail({
        to: String(existing.email || '').trim(),
        subject: String(payload.subject || 'Reply from Luxe Drapes').trim(),
        html: `<p style="white-space: pre-wrap;">${replyMessage}</p>`,
        text: replyMessage
      });
      emailDelivered = true;
    } catch (error) {
      emailWarning = error?.message || 'Failed to send email';
    }
  }

  const updated = {
    ...existing,
    status: 'Replied',
    reply_message: replyMessage,
    replied_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await sql.query(
      `UPDATE contact_messages SET status=$1, reply_message=$2, replied_at=$3, updated_at=$4 WHERE id=$5`,
      [updated.status, updated.reply_message, updated.replied_at, updated.updated_at, id]
    );
    sendJson(res, 200, { ...mapMessage(updated), emailDelivered, emailWarning });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to save reply' });
  }
});

// ---- Orders
app.get('/api/orders', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  try {
    const rows = await sql.query('SELECT * FROM orders ORDER BY created_at DESC');
    sendJson(res, 200, rows.map(mapOrder));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to load orders' });
  }
});

app.post('/api/orders', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const now = new Date().toISOString();

  const row = {
    id: `ord-${Date.now()}`,
    customerName: String(payload.customerName || '').trim(),
    email: String(payload.email || '').trim(),
    phone: String(payload.phone || '').trim(),
    paymentMethod: String(payload.paymentMethod || '').trim(),
    shippingAddress: String(payload.shippingAddress || '').trim(),
    city: String(payload.city || '').trim(),
    notes: String(payload.notes || '').trim(),
    status: 'Pending',
    currency: 'USD',
    subtotal: Number(payload.subtotal) || 0,
    shippingFee: Number(payload.shippingFee) || 0,
    total: Number(payload.total) || 0,
    items: Array.isArray(payload.items) ? payload.items : [],
    createdAt: now,
    updatedAt: now
  };

  if (
    !row.customerName ||
    !row.email ||
    !row.phone ||
    !row.paymentMethod ||
    !row.shippingAddress ||
    !row.city ||
    !row.items.length
  ) {
    sendJson(res, 400, { error: 'Missing required order fields' });
    return;
  }

  try {
    await sql.query(
      `INSERT INTO orders (id, customer_name, email, phone, payment_method, shipping_address, city, notes, status, currency, subtotal, shipping_fee, total, items_json, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        row.id,
        row.customerName,
        row.email,
        row.phone,
        row.paymentMethod,
        row.shippingAddress,
        row.city,
        row.notes || '',
        row.status,
        row.currency,
        row.subtotal,
        row.shippingFee,
        row.total,
        JSON.stringify(row.items),
        row.createdAt,
        row.updatedAt
      ]
    );
    sendJson(res, 201, row);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to save order' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const id = String(req.params.id || '').trim();
  try {
    const rows = await sql.query('SELECT * FROM orders WHERE id = $1', [id]);
    const row = rows?.[0];
    if (!row) {
      sendJson(res, 404, { error: 'Order not found' });
      return;
    }
    sendJson(res, 200, mapOrder(row));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to load order' });
  }
});

const updateOrderStatus = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const id = String(req.params.id || '').trim();
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const nextStatus = String(payload.status || '').trim();

  if (!nextStatus) {
    sendJson(res, 400, { error: 'Missing status' });
    return;
  }

  try {
    await sql.query('UPDATE orders SET status=$1, updated_at=$2 WHERE id=$3', [nextStatus, new Date().toISOString(), id]);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to update order' });
  }
};

// Admin panel uses PUT for status update.
app.put('/api/orders/:id', updateOrderStatus);
app.patch('/api/orders/:id', updateOrderStatus);

app.delete('/api/orders/:id', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const id = String(req.params.id || '').trim();
  try {
    await sql.query('DELETE FROM orders WHERE id = $1', [id]);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to delete order' });
  }
});

// ---- Appointments
app.get('/api/appointments', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  try {
    const rows = await sql.query('SELECT * FROM appointments ORDER BY created_at DESC');
    sendJson(res, 200, rows.map(mapAppointment));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to load appointments' });
  }
});

app.post('/api/appointments', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const now = new Date().toISOString();
  const row = {
    id: `appt-${Date.now()}`,
    name: String(payload.name || '').trim(),
    email: String(payload.email || '').trim(),
    phone: String(payload.phone || '').trim(),
    serviceType: String(payload.serviceType || 'Measurement').trim(),
    preferredDate: String(payload.preferredDate || '').trim(),
    preferredTime: String(payload.preferredTime || '').trim(),
    notes: String(payload.notes || '').trim(),
    status: 'Pending',
    source: String(payload.source || 'website').trim(),
    createdAt: now,
    updatedAt: now
  };

  if (!row.name || !row.email || !row.phone || !row.preferredDate || !row.preferredTime) {
    sendJson(res, 400, { error: 'Missing required fields' });
    return;
  }

  try {
    await sql.query(
      `INSERT INTO appointments (id, name, email, phone, service_type, preferred_date, preferred_time, notes, status, source, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        row.id,
        row.name,
        row.email,
        row.phone,
        row.serviceType,
        row.preferredDate,
        row.preferredTime,
        row.notes || '',
        row.status,
        row.source,
        row.createdAt,
        row.updatedAt
      ]
    );
    sendJson(res, 201, row);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to save appointment' });
  }
});

// ---- Reviews (public)
const getReviewManageToken = (req, payload) => String(
  payload?.manageToken ||
  payload?.editToken ||
  payload?.token ||
  req.headers['x-review-token'] ||
  req.headers['x-manage-token'] ||
  ''
).trim();

app.get('/api/reviews', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  try {
    const rows = await sql.query(
      `SELECT * FROM reviews WHERE status = 'Approved' ORDER BY created_at DESC LIMIT 50`
    );
    sendJson(res, 200, rows.map(mapReview));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to load reviews' });
  }
});

app.post('/api/reviews', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const name = String(payload.customerName || payload.name || '').trim();
  const email = String(payload.email || '').trim();
  const comment = String(payload.comment || payload.message || '').trim();
  const orderId = String(payload.orderId || payload.order_id || '').trim();
  const rating = Number(payload.rating);

  if (!name || !comment || !Number.isFinite(rating)) {
    sendJson(res, 400, { error: 'Missing required review fields' });
    return;
  }
  if (rating < 1 || rating > 5) {
    sendJson(res, 400, { error: 'Rating must be between 1 and 5' });
    return;
  }

  const manageToken = crypto.randomBytes(18).toString('hex');
  const row = {
    id: String(payload.id || `rev-${Date.now()}`),
    customer_name: name,
    email,
    rating,
    comment,
    order_id: orderId,
    status: 'Approved',
    source: String(payload.source || 'website').trim(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    edit_token: manageToken
  };

  try {
    await sql.query(
      `INSERT INTO reviews (id, customer_name, email, rating, comment, order_id, status, source, created_at, updated_at, edit_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        row.id,
        row.customer_name,
        row.email,
        row.rating,
        row.comment,
        row.order_id,
        row.status,
        row.source,
        row.created_at,
        row.updated_at,
        row.edit_token
      ]
    );
    sendJson(res, 201, { ...mapReview(row), manageToken });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to save review' });
  }
});

app.get('/api/admin/reviews', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  try {
    const rows = await sql.query(
      `SELECT * FROM reviews ORDER BY created_at DESC LIMIT 200`
    );
    sendJson(res, 200, rows.map(mapReview));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to load reviews' });
  }
});

app.put('/api/admin/reviews/:id', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const id = String(req.params.id || '').trim();
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const now = new Date().toISOString();

  try {
    const currentRows = await sql.query(`SELECT * FROM reviews WHERE id = $1`, [id]);
    const current = currentRows?.[0];
    if (!current) {
      sendJson(res, 404, { error: 'Review not found' });
      return;
    }

    const nextRow = {
      ...current,
      customer_name: String(payload.customerName ?? current.customer_name ?? '').trim(),
      email: String(payload.email ?? current.email ?? '').trim(),
      rating: Number.isFinite(Number(payload.rating)) ? Number(payload.rating) : Number(current.rating) || 0,
      comment: String(payload.comment ?? current.comment ?? '').trim(),
      order_id: String(payload.orderId ?? current.order_id ?? '').trim(),
      status: String(payload.status ?? current.status ?? 'Approved').trim() || 'Approved',
      updated_at: now
    };

    await sql.query(
      `UPDATE reviews
       SET customer_name=$1, email=$2, rating=$3, comment=$4, order_id=$5, status=$6, updated_at=$7
       WHERE id=$8`,
      [
        nextRow.customer_name,
        nextRow.email,
        nextRow.rating,
        nextRow.comment,
        nextRow.order_id,
        nextRow.status,
        nextRow.updated_at,
        id
      ]
    );

    sendJson(res, 200, mapReview(nextRow));
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to update review' });
  }
});

app.delete('/api/admin/reviews/:id', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const id = String(req.params.id || '').trim();
  try {
    await sql.query(`DELETE FROM reviews WHERE id = $1`, [id]);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to delete review' });
  }
});

app.put('/api/reviews/:id', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const id = String(req.params.id || '').trim();
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const token = getReviewManageToken(req, payload);
  const name = String(payload.customerName || payload.name || '').trim();
  const email = String(payload.email || '').trim();
  const comment = String(payload.comment || payload.message || '').trim();
  const orderId = String(payload.orderId || payload.order_id || '').trim();
  const rating = Number(payload.rating);

  if (!token) {
    sendJson(res, 403, { error: 'Missing review token' });
    return;
  }
  if (!name || !comment || !Number.isFinite(rating)) {
    sendJson(res, 400, { error: 'Missing required review fields' });
    return;
  }
  if (rating < 1 || rating > 5) {
    sendJson(res, 400, { error: 'Rating must be between 1 and 5' });
    return;
  }

  try {
    const rows = await sql.query(`SELECT * FROM reviews WHERE id = $1 AND edit_token = $2`, [id, token]);
    let current = rows?.[0];
    if (!current) {
      const fallbackRows = await sql.query(`SELECT * FROM reviews WHERE id = $1`, [id]);
      const fallback = fallbackRows?.[0];
      if (fallback) {
        await sql.query(
          `UPDATE reviews SET edit_token = $1, updated_at = $2 WHERE id = $3`,
          [token, new Date().toISOString(), id]
        );
        current = { ...fallback, edit_token: token };
      }
    }
    if (!current) {
      sendJson(res, 404, { error: 'Review not found' });
      return;
    }

    const updatedAt = new Date().toISOString();
    const nextRow = {
      ...current,
      customer_name: name,
      email,
      rating,
      comment,
      order_id: orderId,
      updated_at: updatedAt
    };

    await sql.query(
      `UPDATE reviews
       SET customer_name=$1, email=$2, rating=$3, comment=$4, order_id=$5, updated_at=$6
       WHERE id=$7 AND edit_token=$8`,
      [
        nextRow.customer_name,
        nextRow.email,
        nextRow.rating,
        nextRow.comment,
        nextRow.order_id,
        nextRow.updated_at,
        id,
        token
      ]
    );

    sendJson(res, 200, { ...mapReview(nextRow), manageToken: token });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to update review' });
  }
});

app.delete('/api/reviews/:id', async (req, res) => {
  if (handleOptions(req, res)) return;
  if (!(await requireDatabase(req, res))) return;

  const id = String(req.params.id || '').trim();
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const token = getReviewManageToken(req, payload);

  if (!token) {
    sendJson(res, 403, { error: 'Missing review token' });
    return;
  }

  try {
    const rows = await sql.query(`SELECT id, edit_token FROM reviews WHERE id = $1 AND edit_token = $2`, [id, token]);
    let current = rows?.[0];
    if (!current) {
      const fallbackRows = await sql.query(`SELECT id, edit_token FROM reviews WHERE id = $1`, [id]);
      const fallback = fallbackRows?.[0];
      if (fallback) {
        await sql.query(`UPDATE reviews SET edit_token = $1, updated_at = $2 WHERE id = $3`, [token, new Date().toISOString(), id]);
        current = { id, edit_token: token };
      }
    }
    if (!current) {
      sendJson(res, 404, { error: 'Review not found' });
      return;
    }

    await sql.query(`DELETE FROM reviews WHERE id = $1 AND edit_token = $2`, [id, token]);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to delete review' });
  }
});

// ---- Stripe checkout (kept for later)
app.post('/api/checkout/session', async (req, res) => {
  if (handleOptions(req, res)) return;
  const stripe = stripeLib.getStripe();
  if (!stripe) {
    sendJson(res, 400, { error: 'Stripe is not configured' });
    return;
  }

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    sendJson(res, 400, { error: 'Missing items' });
    return;
  }

  try {
    const baseUrl = stripeLib.getBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: items.map((item) => ({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.max(50, Math.round(Number(item.estimatedPrice || 0) * 100)),
          product_data: {
            name: String(item.name || item.key || 'Curtain')
          }
        }
      })),
      success_url: `${baseUrl}/order-success.html`,
      cancel_url: `${baseUrl}/checkout.html`
    });

    sendJson(res, 200, { url: session.url });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to create Stripe session' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
