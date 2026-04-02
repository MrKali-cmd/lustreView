const fs = require('fs');
const os = require('os');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const STORE_PATH = path.join(os.tmpdir(), 'luxe-drapes-store.json');

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
  contactMessages: []
};

let memoryState = null;
let sqlClient = null;
let initPromise = null;

const clone = (value) => JSON.parse(JSON.stringify(value));

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
  contactMessages: Array.isArray(state?.contactMessages) ? state.contactMessages : []
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
  escapeHtml,
  getCollections,
  getMessages,
  handleOptions,
  loadState,
  readJson,
  saveState,
  sendEmpty,
  sendJson,
  setCollections,
  setMessages,
  upsertCollection,
  upsertMessage
};
