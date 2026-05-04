(function () {
    const API_BASE = (() => {
        const configuredBase = window.__LUXE_API_BASE__
            || document.querySelector('meta[name="luxe-api-base"]')?.getAttribute('content')?.trim();
        if (configuredBase) {
            return configuredBase.replace(/\/$/, '');
        }
        const { protocol, hostname, port, origin } = window.location;
        if (protocol === 'file:') {
            return 'http://localhost:3001/api/session-state';
        }
        if (hostname === 'localhost' && port && port !== '3001') {
            return 'http://localhost:3001/api/session-state';
        }
        return `${origin}/api/session-state`;
    })();

    const emptyState = { cart: [], wishlist: [], lastOrder: null };
    let currentState = { ...emptyState };
    let readyPromise = null;

    const normalizeArray = (value) => (Array.isArray(value) ? value : []);
    const normalizeState = (payload) => ({
        cart: normalizeArray(payload?.cart),
        wishlist: normalizeArray(payload?.wishlist),
        lastOrder: payload?.lastOrder && typeof payload.lastOrder === 'object' ? payload.lastOrder : null
    });

    const emitState = (state) => {
        const detail = normalizeState(state);
        window.dispatchEvent(new CustomEvent('luxe-state-changed', { detail }));
        return detail;
    };

    const emitLegacyEvents = (action) => {
        if (action.includes('cart') || action.includes('last-order')) {
            window.dispatchEvent(new Event('cart-updated'));
        }
        if (action.includes('wishlist')) {
            window.dispatchEvent(new Event('wishlist-updated'));
        }
    };

    const parseResponse = async (response) => {
        const raw = await response.text();
        let payload = {};
        if (raw) {
            try {
                payload = JSON.parse(raw);
            } catch {
                payload = { error: raw };
            }
        }
        if (!response.ok) {
            throw new Error(payload.error || `Request failed (${response.status})`);
        }
        return payload;
    };

    const requestState = async (method, body) => {
        const response = await fetch(API_BASE, {
            method,
            credentials: 'include',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        });
        return parseResponse(response);
    };

    const syncState = (payload) => {
        currentState = emitState(payload);
        return currentState;
    };

    const ready = async () => {
        if (!readyPromise) {
            readyPromise = requestState('GET')
                .then(syncState)
                .catch(() => syncState(emptyState));
        }
        await readyPromise;
        return currentState;
    };

    const mutate = async (action, payload = {}) => {
        const next = await requestState('POST', { action, ...payload });
        emitLegacyEvents(action);
        return syncState(next);
    };

    const normalizeSavedItem = (keyOrItem) => {
        if (!keyOrItem) return null;
        if (typeof keyOrItem === 'string') return { key: keyOrItem };
        if (typeof keyOrItem === 'object') {
            const key = String(keyOrItem.key || '').trim();
            if (!key) return null;
            return {
                key,
                image: String(keyOrItem.image || '').trim(),
                category: String(keyOrItem.category || '').trim(),
                name: String(keyOrItem.name || '').trim(),
                description: String(keyOrItem.description || '').trim(),
                priceText: String(keyOrItem.priceText || '').trim(),
                width: Number(keyOrItem.width || 0),
                height: Number(keyOrItem.height || 0),
                estimatedPrice: Number(keyOrItem.estimatedPrice || 0),
                basePrice: Number(keyOrItem.basePrice || 0)
            };
        }
        return null;
    };

    window.LuxeState = {
        ready,
        getSnapshot: () => currentState,
        addToCart: (item) => mutate('add-cart', { item: normalizeSavedItem(item) }),
        removeFromCart: (key) => mutate('remove-cart', { key }),
        clearCart: () => mutate('clear-cart'),
        addToWishlist: (item) => mutate('add-wishlist', { item: normalizeSavedItem(item), key: typeof item === 'string' ? item : item?.key }),
        removeFromWishlist: (key) => mutate('remove-wishlist', { key }),
        clearWishlist: () => mutate('clear-wishlist'),
        moveToCart: (item) => mutate('move-to-cart', { item: normalizeSavedItem(item), key: typeof item === 'string' ? item : item?.key }),
        moveToWishlist: (item) => mutate('move-to-wishlist', { item: normalizeSavedItem(item), key: typeof item === 'string' ? item : item?.key }),
        setLastOrder: (order) => mutate('set-last-order', { order }),
        clearLastOrder: () => mutate('clear-last-order')
    };

    ready().catch(() => {});
})();
