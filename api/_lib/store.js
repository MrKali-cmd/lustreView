const fs = require('fs');
const os = require('os');
const path = require('path');

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

const clone = (value) => JSON.parse(JSON.stringify(value));

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

const getCollections = () => clone(loadState().collections).sort((a, b) => {
  const left = new Date(b.updatedAt || 0).getTime();
  const right = new Date(a.updatedAt || 0).getTime();
  return left - right;
});

const setCollections = (collections) => {
  const state = loadState();
  state.collections = clone(collections);
  saveState(state);
  return getCollections();
};

const upsertCollection = (row) => {
  const collections = loadState().collections.slice();
  const index = collections.findIndex((item) => item.id === row.id);
  if (index >= 0) {
    collections[index] = row;
  } else {
    collections.unshift(row);
  }
  return setCollections(collections);
};

const deleteCollection = (id) => {
  const collections = loadState().collections.filter((item) => item.id !== id);
  setCollections(collections);
};

const getMessages = () => clone(loadState().contactMessages).sort((a, b) => {
  const left = new Date(b.createdAt || 0).getTime();
  const right = new Date(a.createdAt || 0).getTime();
  return left - right;
});

const setMessages = (messages) => {
  const state = loadState();
  state.contactMessages = clone(messages);
  saveState(state);
  return getMessages();
};

const upsertMessage = (row) => {
  const messages = loadState().contactMessages.slice();
  const index = messages.findIndex((item) => item.id === row.id);
  if (index >= 0) {
    messages[index] = row;
  } else {
    messages.unshift(row);
  }
  return setMessages(messages);
};

const deleteMessage = (id) => {
  const messages = loadState().contactMessages.filter((item) => item.id !== id);
  setMessages(messages);
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
