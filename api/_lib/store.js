const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const STORE_PATH = path.join(os.tmpdir(), 'luxe-drapes-store.json');
const SITE_SESSION_COOKIE = 'luxe_site_session';

const DEFAULT_COLLECTIONS = [
  {
    id: 'seed-1',
    name: 'Soft Taupe Zebra Dual Layer',
    label: 'Beige / Taupe - Light Filtering',
    tags: 'beige taupe light filtering',
    type: 'Light Filtering',
    status: 'Live',
    price: 2850000,
    popular: 8,
    rating: 4.5,
    badge: 'New 2026',
    image: 'https://twopagescurtains.com/cdn/shop/files/cream-zbs-2-brio-1.webp?v=1765760097&width=1500',
    description: 'Warm beige stripes with sheer bands for soft diffused light in living rooms and kitchens.',
    updatedAt: '2026-03-05'
  },
  {
    id: 'seed-2',
    name: 'Charcoal Gray Zebra Blackout',
    label: 'Gray - Blackout',
    tags: 'gray charcoal blackout',
    type: 'Blackout',
    status: 'Live',
    price: 3450000,
    popular: 10,
    rating: 5,
    badge: 'Best Seller',
    image: 'https://directbuyblinds.com/blog/wp-content/uploads/2025/07/Zebra-Shades-Transformation-in-Living-Room-1024x683.jpg',
    description: 'Full blackout capability with charcoal tones - perfect privacy and darkness for bedrooms.',
    updatedAt: '2026-03-02'
  },
  {
    id: 'seed-3',
    name: 'Ivory Cream Zebra Shades',
    label: 'Cream - Light Filtering',
    tags: 'cream ivory light filtering',
    type: 'Light Filtering',
    status: 'Live',
    price: 2650000,
    popular: 9,
    rating: 4.5,
    badge: 'Popular',
    image: 'https://cdn11.bigcommerce.com/s-n13icvyv0w/product_images/uploaded_images/springblinds-zebra-shades-ivory.jpg',
    description: 'Bright cream tones with soft sheer bands - creates a calm, airy feel in bright spaces.',
    updatedAt: '2026-02-20'
  },
  {
    id: 'seed-4',
    name: 'Warm Beige Zebra Blackout',
    label: 'Beige - Blackout',
    tags: 'beige taupe blackout',
    type: 'Blackout',
    status: 'Draft',
    price: 3150000,
    popular: 7,
    rating: 5,
    badge: 'Eco Friendly',
    image: 'https://i0.wp.com/galleryshuttersinc.com/wp-content/uploads/2025/02/a-modern-living-room-with-large-windows-and-wooden-blinds.jpg?fit=1024%2C576&ssl=1',
    description: 'Cozy warm beige with complete light blocking - great for large living areas and home theaters.',
    updatedAt: '2026-02-18'
  }
];

const DEFAULT_STATE = {
  collections: DEFAULT_COLLECTIONS,
  contactMessages: [],
  orders: [],
  sessions: {}
};

let memoryState = null;
let sqlClient = null;
let initPromise = null;

const clone = (value) => JSON.parse(JSON.stringify(value));

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

const getCookieValue = (req, name) => {
  const cookies = parseCookies(req.headers?.cookie || req.headers?.Cookie || '');
  return cookies[name] || '';
};

const appendSetCookie = (res, cookieValue) => {
  if (!res || !cookieValue) return;
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookieValue]);
    return;
  }

  res.setHeader('Set-Cookie', [current, cookieValue]);
};

const shouldUseSecureCookie = (req) => {
  const configured = String(process.env.SITE_COOKIE_SECURE || '').trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;

  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto'] || '').toLowerCase();
  return forwardedProto.includes('https') || process.env.VERCEL === '1';
};

const buildSessionCookie = (req, sessionId) => {
  const secure = shouldUseSecureCookie(req);
  const maxAge = 60 * 60 * 24 * 30;
  const parts = [
    `${SITE_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
};

const ensureSiteSessionId = (req, res) => {
  const existing = getCookieValue(req, SITE_SESSION_COOKIE);
  if (existing) return existing;

  const sessionId = `sess-${crypto.randomUUID()}`;
  appendSetCookie(res, buildSessionCookie(req, sessionId));
  return sessionId;
};

const getSqlClient = () => {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) return null;
  if (!sqlClient) {
    sqlClient = neon(databaseUrl);
  }
  return sqlClient;
};

const hasRemoteDatabase = () => Boolean(getSqlClient());

const mapCollectionRow = (row) => ({
  id: row.id,
  name: row.name,
  label: row.label,
  tags: row.tags,
  type: row.type,
  status: row.status,
  price: Number(row.price) || 0,
  popular: Number(row.popular) || 0,
  rating: Number(row.rating) || 0,
  badge: row.badge || '',
  image: row.image,
  description: row.description,
  updatedAt: row.updated_at || row.updatedAt || ''
});

const mapMessageRow = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone || '',
  email: row.email || row.phone || '',
  roomType: row.room_type || row.roomType || '',
  message: row.message || '',
  status: row.status,
  source: row.source || '',
  replyMessage: row.reply_message || row.replyMessage || '',
  repliedAt: row.replied_at || row.repliedAt || '',
  createdAt: row.created_at || row.createdAt || '',
  updatedAt: row.updated_at || row.updatedAt || ''
});

const mapOrderRow = (row) => ({
  id: row.id,
  customerName: row.customer_name || row.customerName || '',
  email: row.email || '',
  phone: row.phone || '',
  paymentMethod: row.payment_method || row.paymentMethod || '',
  shippingAddress: row.shipping_address || row.shippingAddress || '',
  city: row.city || '',
  notes: row.notes || '',
  status: row.status || 'Pending',
  currency: row.currency || 'USD',
  subtotal: Number(row.subtotal) || 0,
  shippingFee: Number(row.shipping_fee || row.shippingFee) || 0,
  total: Number(row.total) || 0,
  items: (() => {
    const raw = row.items_json || row.itemsJson || row.items;
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  })(),
  createdAt: row.created_at || row.createdAt || '',
  updatedAt: row.updated_at || row.updatedAt || ''
});

const mapSessionRow = (row) => ({
  sessionId: row.session_id,
  cart: (() => {
    const raw = row.cart_json || row.cartJson || row.cart;
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  })(),
  wishlist: (() => {
    const raw = row.wishlist_json || row.wishlistJson || row.wishlist;
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  })(),
  lastOrder: (() => {
    const raw = row.last_order_json || row.lastOrderJson || row.lastOrder;
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })(),
  createdAt: row.created_at || row.createdAt || '',
  updatedAt: row.updated_at || row.updatedAt || ''
});

const normalizeSessionState = (state) => ({
  cart: Array.isArray(state?.cart) ? state.cart : [],
  wishlist: Array.isArray(state?.wishlist) ? state.wishlist : [],
  lastOrder: state?.lastOrder && typeof state.lastOrder === 'object' ? state.lastOrder : null,
  createdAt: state?.createdAt || '',
  updatedAt: state?.updatedAt || ''
});

const ensureRemoteDatabase = async () => {
  const sql = getSqlClient();
  if (!sql) return false;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        label TEXT NOT NULL,
        tags TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        price INTEGER NOT NULL DEFAULT 0,
        popular INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 0,
        badge TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL,
        description TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        room_type TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        reply_message TEXT NOT NULL DEFAULT '',
        replied_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        shipping_address TEXT NOT NULL,
        city TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        subtotal INTEGER NOT NULL DEFAULT 0,
        shipping_fee INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        items_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS browser_sessions (
        session_id TEXT PRIMARY KEY,
        cart_json TEXT NOT NULL DEFAULT '[]',
        wishlist_json TEXT NOT NULL DEFAULT '[]',
        last_order_json TEXT NOT NULL DEFAULT 'null',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    const collectionCount = await sql`SELECT COUNT(*)::int AS count FROM collections`;
    if (Number(collectionCount?.[0]?.count || 0) === 0) {
      for (const row of DEFAULT_COLLECTIONS) {
        await sql`
          INSERT INTO collections (
            id, name, label, tags, type, status, price, popular, rating, badge, image, description, updated_at
          ) VALUES (
            ${row.id},
            ${row.name},
            ${row.label},
            ${row.tags},
            ${row.type},
            ${row.status},
            ${Number(row.price) || 0},
            ${Number(row.popular) || 0},
            ${Number(row.rating) || 0},
            ${row.badge || ''},
            ${row.image},
            ${row.description},
            ${row.updatedAt || new Date().toISOString()}
          )
        `;
      }
    }
  })();

  return initPromise;
};

const normalizeState = (state) => ({
  collections: Array.isArray(state?.collections) ? state.collections : clone(DEFAULT_COLLECTIONS),
  contactMessages: Array.isArray(state?.contactMessages) ? state.contactMessages : [],
  orders: Array.isArray(state?.orders) ? state.orders : [],
  sessions: state?.sessions && typeof state.sessions === 'object' ? state.sessions : {}
});

const loadState = () => {
  if (memoryState) return memoryState;

  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      memoryState = normalizeState(JSON.parse(raw));
      return memoryState;
    }
  } catch {
    // Fall back to seeded state if the tmp store cannot be read.
  }

  memoryState = clone(DEFAULT_STATE);
  return memoryState;
};

const saveState = (state) => {
  memoryState = normalizeState(state);
  fs.writeFileSync(STORE_PATH, JSON.stringify(memoryState, null, 2));
  return memoryState;
};

const getCollections = async () => {
  if (!hasRemoteDatabase()) {
    return clone(loadState().collections).sort((a, b) => {
      const left = new Date(b.updatedAt || 0).getTime();
      const right = new Date(a.updatedAt || 0).getTime();
      return left - right;
    });
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  const rows = await sql`
    SELECT id, name, label, tags, type, status, price, popular, rating, badge, image, description, updated_at
    FROM collections
    ORDER BY updated_at DESC
  `;
  return rows.map(mapCollectionRow);
};

const setCollections = async (collections) => {
  if (!hasRemoteDatabase()) {
    const state = loadState();
    state.collections = clone(collections);
    saveState(state);
    return getCollections();
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  await sql`DELETE FROM collections`;
  for (const row of collections) {
    await sql`
      INSERT INTO collections (
        id, name, label, tags, type, status, price, popular, rating, badge, image, description, updated_at
      ) VALUES (
        ${row.id},
        ${row.name},
        ${row.label},
        ${row.tags},
        ${row.type},
        ${row.status},
        ${Number(row.price) || 0},
        ${Number(row.popular) || 0},
        ${Number(row.rating) || 0},
        ${row.badge || ''},
        ${row.image},
        ${row.description},
        ${row.updatedAt || new Date().toISOString()}
      )
    `;
  }
  return getCollections();
};

const upsertCollection = async (row) => {
  if (!hasRemoteDatabase()) {
    const collections = loadState().collections.slice();
    const index = collections.findIndex((item) => item.id === row.id);
    if (index >= 0) {
      collections[index] = row;
    } else {
      collections.unshift(row);
    }
    return setCollections(collections);
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  await sql`
    INSERT INTO collections (
      id, name, label, tags, type, status, price, popular, rating, badge, image, description, updated_at
    ) VALUES (
      ${row.id},
      ${row.name},
      ${row.label},
      ${row.tags},
      ${row.type},
      ${row.status},
      ${Number(row.price) || 0},
      ${Number(row.popular) || 0},
      ${Number(row.rating) || 0},
      ${row.badge || ''},
      ${row.image},
      ${row.description},
      ${row.updatedAt || new Date().toISOString()}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      label = EXCLUDED.label,
      tags = EXCLUDED.tags,
      type = EXCLUDED.type,
      status = EXCLUDED.status,
      price = EXCLUDED.price,
      popular = EXCLUDED.popular,
      rating = EXCLUDED.rating,
      badge = EXCLUDED.badge,
      image = EXCLUDED.image,
      description = EXCLUDED.description,
      updated_at = EXCLUDED.updated_at
  `;
  return row;
};

const deleteCollection = async (id) => {
  if (!hasRemoteDatabase()) {
    const collections = loadState().collections.filter((item) => item.id !== id);
    setCollections(collections);
    return;
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  await sql`DELETE FROM collections WHERE id = ${id}`;
};

const getMessages = async () => {
  if (!hasRemoteDatabase()) {
    return clone(loadState().contactMessages).sort((a, b) => {
      const left = new Date(b.createdAt || 0).getTime();
      const right = new Date(a.createdAt || 0).getTime();
      return left - right;
    });
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  const rows = await sql`
    SELECT id, name, phone, email, room_type, message, status, source, reply_message, replied_at, created_at, updated_at
    FROM contact_messages
    ORDER BY created_at DESC
  `;
  return rows.map(mapMessageRow);
};

const setMessages = async (messages) => {
  if (!hasRemoteDatabase()) {
    const state = loadState();
    state.contactMessages = clone(messages);
    saveState(state);
    return getMessages();
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  await sql`DELETE FROM contact_messages`;
  for (const row of messages) {
    await sql`
      INSERT INTO contact_messages (
        id, name, phone, email, room_type, message, status, source, reply_message, replied_at, created_at, updated_at
      ) VALUES (
        ${row.id},
        ${row.name},
        ${row.phone},
        ${row.email},
        ${row.roomType},
        ${row.message},
        ${row.status},
        ${row.source},
        ${row.replyMessage || ''},
        ${row.repliedAt || ''},
        ${row.createdAt || new Date().toISOString()},
        ${row.updatedAt || new Date().toISOString()}
      )
    `;
  }
  return getMessages();
};

const upsertMessage = async (row) => {
  if (!hasRemoteDatabase()) {
    const messages = loadState().contactMessages.slice();
    const index = messages.findIndex((item) => item.id === row.id);
    if (index >= 0) {
      messages[index] = row;
    } else {
      messages.unshift(row);
    }
    return setMessages(messages);
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  await sql`
    INSERT INTO contact_messages (
      id, name, phone, email, room_type, message, status, source, reply_message, replied_at, created_at, updated_at
    ) VALUES (
      ${row.id},
      ${row.name},
      ${row.phone},
      ${row.email},
      ${row.roomType},
      ${row.message},
      ${row.status},
      ${row.source},
      ${row.replyMessage || ''},
      ${row.repliedAt || ''},
      ${row.createdAt || new Date().toISOString()},
      ${row.updatedAt || new Date().toISOString()}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      room_type = EXCLUDED.room_type,
      message = EXCLUDED.message,
      status = EXCLUDED.status,
      source = EXCLUDED.source,
      reply_message = EXCLUDED.reply_message,
      replied_at = EXCLUDED.replied_at,
      created_at = COALESCE(contact_messages.created_at, EXCLUDED.created_at),
      updated_at = EXCLUDED.updated_at
  `;
  return row;
};

const deleteMessage = async (id) => {
  if (!hasRemoteDatabase()) {
    const messages = loadState().contactMessages.filter((item) => item.id !== id);
    setMessages(messages);
    return;
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  await sql`DELETE FROM contact_messages WHERE id = ${id}`;
};

const getOrders = async () => {
  if (!hasRemoteDatabase()) {
    return clone(loadState().orders).sort((a, b) => {
      const left = new Date(b.createdAt || 0).getTime();
      const right = new Date(a.createdAt || 0).getTime();
      return left - right;
    });
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  const rows = await sql`
    SELECT id, customer_name, email, phone, payment_method, shipping_address, city, notes, status, currency, subtotal, shipping_fee, total, items_json, created_at, updated_at
    FROM orders
    ORDER BY created_at DESC
  `;
  return rows.map(mapOrderRow);
};

const setOrders = async (orders) => {
  if (!hasRemoteDatabase()) {
    const state = loadState();
    state.orders = clone(orders);
    saveState(state);
    return getOrders();
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  await sql`DELETE FROM orders`;
  for (const row of orders) {
    await sql`
      INSERT INTO orders (
        id, customer_name, email, phone, payment_method, shipping_address, city, notes, status, currency, subtotal, shipping_fee, total, items_json, created_at, updated_at
      ) VALUES (
        ${row.id},
        ${row.customerName},
        ${row.email},
        ${row.phone},
        ${row.paymentMethod},
        ${row.shippingAddress},
        ${row.city},
        ${row.notes || ''},
        ${row.status || 'Pending'},
        ${row.currency || 'USD'},
        ${Number(row.subtotal) || 0},
        ${Number(row.shippingFee) || 0},
        ${Number(row.total) || 0},
        ${JSON.stringify(Array.isArray(row.items) ? row.items : [])},
        ${row.createdAt || new Date().toISOString()},
        ${row.updatedAt || new Date().toISOString()}
      )
    `;
  }
  return getOrders();
};

const upsertOrder = async (row) => {
  if (!hasRemoteDatabase()) {
    const orders = loadState().orders.slice();
    const index = orders.findIndex((item) => item.id === row.id);
    if (index >= 0) {
      orders[index] = row;
    } else {
      orders.unshift(row);
    }
    return setOrders(orders);
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  await sql`
    INSERT INTO orders (
      id, customer_name, email, phone, payment_method, shipping_address, city, notes, status, currency, subtotal, shipping_fee, total, items_json, created_at, updated_at
    ) VALUES (
      ${row.id},
      ${row.customerName},
      ${row.email},
      ${row.phone},
      ${row.paymentMethod},
      ${row.shippingAddress},
      ${row.city},
      ${row.notes || ''},
      ${row.status || 'Pending'},
      ${row.currency || 'USD'},
      ${Number(row.subtotal) || 0},
      ${Number(row.shippingFee) || 0},
      ${Number(row.total) || 0},
      ${JSON.stringify(Array.isArray(row.items) ? row.items : [])},
      ${row.createdAt || new Date().toISOString()},
      ${row.updatedAt || new Date().toISOString()}
    )
    ON CONFLICT (id) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      payment_method = EXCLUDED.payment_method,
      shipping_address = EXCLUDED.shipping_address,
      city = EXCLUDED.city,
      notes = EXCLUDED.notes,
      status = EXCLUDED.status,
      currency = EXCLUDED.currency,
      subtotal = EXCLUDED.subtotal,
      shipping_fee = EXCLUDED.shipping_fee,
      total = EXCLUDED.total,
      items_json = EXCLUDED.items_json,
      created_at = COALESCE(orders.created_at, EXCLUDED.created_at),
      updated_at = EXCLUDED.updated_at
  `;
  return row;
};

const deleteOrder = async (id) => {
  if (!hasRemoteDatabase()) {
    const orders = loadState().orders.filter((item) => item.id !== id);
    setOrders(orders);
    return;
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  await sql`DELETE FROM orders WHERE id = ${id}`;
};

const getSessionState = async (sessionId) => {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return normalizeSessionState();
  }

  if (!hasRemoteDatabase()) {
    const state = loadState();
    if (!state.sessions || typeof state.sessions !== 'object') {
      state.sessions = {};
    }

    if (!state.sessions[normalizedSessionId]) {
      state.sessions[normalizedSessionId] = normalizeSessionState({
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      saveState(state);
    }

    return normalizeSessionState(state.sessions[normalizedSessionId]);
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  const rows = await sql`
    SELECT session_id, cart_json, wishlist_json, last_order_json, created_at, updated_at
    FROM browser_sessions
    WHERE session_id = ${normalizedSessionId}
    LIMIT 1
  `;

  if (rows.length) {
    return mapSessionRow(rows[0]);
  }

  const now = new Date().toISOString();
  await sql`
    INSERT INTO browser_sessions (
      session_id, cart_json, wishlist_json, last_order_json, created_at, updated_at
    ) VALUES (
      ${normalizedSessionId},
      ${'[]'},
      ${'[]'},
      ${'null'},
      ${now},
      ${now}
    )
  `;

  return normalizeSessionState({
    cart: [],
    wishlist: [],
    lastOrder: null,
    createdAt: now,
    updatedAt: now
  });
};

const setSessionState = async (sessionId, nextState) => {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return normalizeSessionState(nextState);
  }

  const state = normalizeSessionState(nextState);
  const now = new Date().toISOString();
  const sessionRecord = {
    ...state,
    createdAt: state.createdAt || now,
    updatedAt: now
  };

  if (!hasRemoteDatabase()) {
    const appState = loadState();
    if (!appState.sessions || typeof appState.sessions !== 'object') {
      appState.sessions = {};
    }

    appState.sessions[normalizedSessionId] = sessionRecord;
    saveState(appState);
    return normalizeSessionState(appState.sessions[normalizedSessionId]);
  }

  const sql = getSqlClient();
  await ensureRemoteDatabase();
  await sql`
    INSERT INTO browser_sessions (
      session_id, cart_json, wishlist_json, last_order_json, created_at, updated_at
    ) VALUES (
      ${normalizedSessionId},
      ${JSON.stringify(state.cart)},
      ${JSON.stringify(state.wishlist)},
      ${JSON.stringify(state.lastOrder)},
      ${state.createdAt || now},
      ${now}
    )
    ON CONFLICT (session_id) DO UPDATE SET
      cart_json = EXCLUDED.cart_json,
      wishlist_json = EXCLUDED.wishlist_json,
      last_order_json = EXCLUDED.last_order_json,
      created_at = COALESCE(browser_sessions.created_at, EXCLUDED.created_at),
      updated_at = EXCLUDED.updated_at
  `;

  return normalizeSessionState({
    ...state,
    createdAt: state.createdAt || now,
    updatedAt: now
  });
};

const updateSessionState = async (sessionId, updater) => {
  const current = await getSessionState(sessionId);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  return setSessionState(sessionId, next);
};

const readJson = async (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });
  req.on('end', () => {
    if (!raw) {
      resolve({});
      return;
    }

    try {
      resolve(JSON.parse(raw));
    } catch (error) {
      reject(error);
    }
  });
  req.on('error', reject);
});

const setCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
};

const sendJson = (res, statusCode, payload) => {
  setCors(res);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
};

const sendEmpty = (res, statusCode = 204) => {
  setCors(res);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.statusCode = statusCode;
  res.end();
};

const handleOptions = (req, res) => {
  if (req.method === 'OPTIONS') {
    sendEmpty(res, 204);
    return true;
  }

  return false;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

module.exports = {
  clone,
  deleteCollection,
  deleteMessage,
  deleteOrder,
  escapeHtml,
  getCollections,
  getMessages,
  getOrders,
  getSessionState,
  handleOptions,
  loadState,
  readJson,
  saveState,
  sendEmpty,
  sendJson,
  setCollections,
  setMessages,
  setOrders,
  setSessionState,
  upsertCollection,
  upsertMessage,
  upsertOrder,
  updateSessionState,
  ensureSiteSessionId
};
