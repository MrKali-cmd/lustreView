const {
  ensureSiteSessionId,
  getSessionState,
  handleOptions,
  readJson,
  sendJson,
  updateSessionState
} = require('./_lib/store');

const normalizeKey = (value) => String(value || '').trim();

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  const sessionId = ensureSiteSessionId(req, res);

  if (req.method === 'GET') {
    sendJson(res, 200, await getSessionState(sessionId));
    return;
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const payload = await readJson(req);
    const action = String(payload.action || '').trim();
    const key = normalizeKey(payload.key || payload.itemKey);

    if (!action) {
      sendJson(res, 400, { error: 'Missing action' });
      return;
    }

    const nextState = await updateSessionState(sessionId, (current) => {
      const cart = new Set(Array.isArray(current.cart) ? current.cart : []);
      const wishlist = new Set(Array.isArray(current.wishlist) ? current.wishlist : []);
      let lastOrder = current.lastOrder && typeof current.lastOrder === 'object' ? current.lastOrder : null;

      const addItem = (set) => {
        if (key) set.add(key);
      };

      const removeItem = (set) => {
        if (key) set.delete(key);
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
        default:
          return null;
      }

      return {
        ...current,
        cart: Array.from(cart),
        wishlist: Array.from(wishlist),
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
