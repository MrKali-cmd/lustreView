const {
  ensureSiteSessionId,
  getSessionState,
  handleOptions,
  readJson,
  sendJson,
  updateSessionState
} = require('./_lib/store');

const normalizeKey = (value) => String(value || '').trim();
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
const getItemKey = (value) => (typeof value === 'object' && value ? normalizeKey(value.key) : normalizeKey(value));
const getRequestPayload = async (req) => {
  if (req && req.body && typeof req.body === 'object') {
    return req.body;
  }
  return readJson(req);
};

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  const sessionId = ensureSiteSessionId(req, res);

  if (req.method === 'GET') {
    sendJson(res, 200, await getSessionState(sessionId));
    return;
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const payload = await getRequestPayload(req);
    const action = String(payload.action || '').trim();
    const key = normalizeKey(payload.key || payload.itemKey);
    const item = normalizeCartItem(payload.item, key);
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

    const nextState = await updateSessionState(sessionId, (current) => {
      const cartEntries = Array.isArray(current.cart) ? current.cart : [];
      const cart = cartEntries.reduce((map, entry) => {
        const entryKey = getItemKey(entry);
        if (entryKey) map.set(entryKey, typeof entry === 'object' && entry ? entry : { key: entryKey });
        return map;
      }, new Map());
      const wishlistEntries = Array.isArray(current.wishlist) ? current.wishlist : [];
      const wishlist = wishlistEntries.reduce((map, entry) => {
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

      return {
        ...current,
        cart: Array.from(cart.values()),
        wishlist: Array.from(wishlist.values()),
        lastOrder
      };
    });

    if (!nextState) {
      sendJson(res, 400, { error: 'Unsupported action' });
      return;
    }

    sendJson(res, 200, nextState);
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
};
