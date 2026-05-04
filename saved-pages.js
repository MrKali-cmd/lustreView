(function () {
    const API_BASE = (() => {
        const configuredBase = window.__LUXE_API_BASE__
            || document.querySelector('meta[name="luxe-api-base"]')?.getAttribute('content')?.trim();
        if (configuredBase) {
            return configuredBase.replace(/\/$/, '');
        }
        const { protocol, hostname, port, origin } = window.location;
        if (protocol === 'file:') {
            return 'http://localhost:3001/api';
        }
        if (hostname === 'localhost' && port && port !== '3001') {
            return 'http://localhost:3001/api';
        }
        return `${origin}/api`;
    })();
    const baseCatalog = Array.isArray(window.LUXE_CATALOG) ? window.LUXE_CATALOG : [];
    let remoteCatalog = [];
    let catalogReadyPromise = null;
    const pageType = document.body.dataset.savedPage || 'wishlist';
    const pageConfig = {
        wishlist: {
            kicker: 'Saved List',
            title: 'Wishlist',
            desc: 'Everything you save from the collection lands here. Keep browsing, compare options, and move the ones you want into the cart when ready.',
            countLabel: 'saved item',
            empty: 'Your wishlist is empty. Tap the heart on any product to save it here.',
            summaryTitle: 'Wishlist summary',
            summaryText: 'Saved items stay here until you move them to the cart or remove them.',
            summaryValueLabel: 'Saved value',
            primaryLabel: 'View Cart',
            primaryHref: 'cart.html'
        },
        cart: {
            kicker: 'Shopping Cart',
            title: 'Cart',
            desc: 'Review the pieces you are ready to request. You can remove items, move them back to your wishlist, or continue to checkout.',
            countLabel: 'cart item',
            empty: 'Your cart is empty. Tap the cart icon on any product to add it here.',
            summaryTitle: 'Cart summary',
            summaryText: 'Use the cart to keep a clean shortlist before checking out.',
            summaryValueLabel: 'Subtotal',
            primaryLabel: 'Start checkout',
            primaryHref: 'checkout.html'
        }
    };

    const config = pageConfig[pageType] || pageConfig.wishlist;
    const listEl = document.getElementById('saved-list');
    const countEl = document.getElementById('saved-count');
    const titleEl = document.getElementById('saved-title');
    const descEl = document.getElementById('saved-desc');
    const kickerEl = document.getElementById('saved-kicker');
    const summaryTitleEl = document.getElementById('saved-summary-title');
    const summaryTextEl = document.getElementById('saved-summary-text');
    const summaryValueLabelEl = document.getElementById('saved-summary-value-label');
    const summaryValueEl = document.getElementById('saved-summary-value');
    const summaryCountEl = document.getElementById('saved-summary-count');
    const primaryCtaEl = document.getElementById('saved-primary-cta');
    const focusKey = new URLSearchParams(window.location.search).get('focus') || '';
    const header = document.querySelector('header');
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenuIcon = mobileMenuBtn?.querySelector('i');
    const headerCartCount = document.querySelector('[data-cart-count]');
    const headerWishlistCount = document.querySelector('[data-wishlist-count]');
    let focusTimer = null;
    const USD_RATE = 42000;
    const IMAGE_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#f5efe2"/>
                    <stop offset="100%" stop-color="#d9c08a"/>
                </linearGradient>
            </defs>
            <rect width="720" height="520" rx="32" fill="url(#bg)"/>
            <g fill="none" stroke="rgba(34,28,18,0.18)" stroke-width="14">
                <rect x="136" y="76" width="448" height="368" rx="26"/>
                <line x1="360" y1="76" x2="360" y2="444"/>
                <line x1="136" y1="214" x2="584" y2="214"/>
            </g>
            <text x="360" y="484" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#2d2418">
                Luxe Drapes
            </text>
        </svg>
    `)}`;

    const toUsd = (value) => Number(value || 0) / USD_RATE;
    const formatBasePrice = (rawValue) => `From $${toUsd(rawValue).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} / m�`;
    const formatMeasurement = (item) => {
        const width = Number(item?.width || 0);
        const height = Number(item?.height || 0);
        if (!width || !height) return '';
        return `${width} cm x ${height} cm`;
    };
    const formatEstimatedPrice = (item) => {
        const estimated = Number(item?.estimatedPrice || 0);
        if (!estimated) return '';
        return `$${estimated.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    };

    const normalizeLookupKey = (value) => String(value || '')
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const normalizeCatalogItem = (item) => {
        if (!item || typeof item !== 'object') return null;
        const key = String(item.key || item.name || '').trim();
        if (!key) return null;
        return {
            key,
            lookupKey: normalizeLookupKey(key),
            image: String(item.image || '').trim(),
            category: String(item.category || item.label || '').trim(),
            label: String(item.label || item.category || '').trim(),
            name: String(item.name || key).trim(),
            description: String(item.description || '').trim(),
            priceText: String(item.priceText || '').trim(),
            basePrice: Number(item.basePrice || item.price || 0)
        };
    };
    const localCatalog = baseCatalog.map(normalizeCatalogItem).filter(Boolean);
    const DEFAULT_IMAGE = localCatalog.find((item) => item.image)?.image || IMAGE_PLACEHOLDER;
    const getCatalogItem = (key) => {
        const normalizedKey = normalizeLookupKey(key);
        if (!normalizedKey) return null;
        return localCatalog.find((item) =>
            item.lookupKey === normalizedKey
            || normalizeLookupKey(item.name) === normalizedKey
            || normalizeLookupKey(item.key) === normalizedKey
        ) || remoteCatalog.find((item) =>
            item.lookupKey === normalizedKey
            || normalizeLookupKey(item.name) === normalizedKey
            || normalizeLookupKey(item.key) === normalizedKey
        )
            || null;
    };
    const loadRemoteCatalog = async () => {
        try {
            const response = await fetch(`${API_BASE}/collections`);
            if (!response.ok) throw new Error(`Failed to load collections (${response.status})`);
            const items = await response.json();
            remoteCatalog = Array.isArray(items) ? items.map(normalizeCatalogItem).filter(Boolean) : [];
        } catch {
            remoteCatalog = [];
        }
    };
    const ensureCatalog = async () => {
        if (!catalogReadyPromise) {
            catalogReadyPromise = loadRemoteCatalog();
        }
        await catalogReadyPromise;
    };
    const toSavedEntry = (entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const key = String(entry.key || '').trim();
        if (!key) return null;
        return {
            key,
            image: String(entry.image || '').trim(),
            category: String(entry.category || '').trim(),
            name: String(entry.name || key).trim(),
            description: String(entry.description || '').trim(),
            priceText: String(entry.priceText || '').trim(),
            basePrice: Number(entry.basePrice || 0),
            width: Number(entry.width || 0),
            height: Number(entry.height || 0),
            estimatedPrice: Number(entry.estimatedPrice || 0)
        };
    };
    const mergeItemData = (catalogItem, savedEntry, key) => {
        const merged = {
            ...(catalogItem || {}),
            key
        };
        if (!savedEntry) return merged;
        Object.entries(savedEntry).forEach(([field, value]) => {
            if (field === 'key') return;
            if (typeof value === 'string') {
                if (value.trim()) merged[field] = value.trim();
                return;
            }
            if (typeof value === 'number') {
                if (Number.isFinite(value) && value > 0) merged[field] = value;
                return;
            }
            if (value) {
                merged[field] = value;
            }
        });
        return merged;
    };
    const resolveImage = (item) => String(item?.image || '').trim() || DEFAULT_IMAGE || IMAGE_PLACEHOLDER;

    const getState = async () => {
        if (window.LuxeState?.ready) {
            return window.LuxeState.ready();
        }
        return { cart: [], wishlist: [], lastOrder: null };
    };

    const getCurrentState = () => (window.LuxeState?.getSnapshot ? window.LuxeState.getSnapshot() : { cart: [], wishlist: [], lastOrder: null });

    const getEntryKey = (entry) => (entry && typeof entry === 'object' ? entry.key : entry);

    const renderSummary = (items) => {
        summaryCountEl.textContent = `${items.length} ${config.countLabel}${items.length === 1 ? '' : 's'}`;
    };

    const focusItem = () => {
        if (!focusKey) return;
        const target = listEl.querySelector(`[data-item-key="${CSS.escape(focusKey)}"]`);
        if (!target) return;
        target.classList.add('is-focus');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearTimeout(focusTimer);
        focusTimer = setTimeout(() => target.classList.remove('is-focus'), 2200);
    };

    const render = async () => {
        await ensureCatalog();
        const state = await getState();
        const activeEntries = Array.isArray(state[pageType]) ? state[pageType] : [];
        const items = activeEntries.map((entry) => {
            const key = getEntryKey(entry);
            const catalogItem = getCatalogItem(key) || getCatalogItem(entry?.name);
            const savedEntry = toSavedEntry(entry);
            if (!catalogItem && !savedEntry) return null;
            return mergeItemData(catalogItem, savedEntry, key);
        }).filter(Boolean);

        titleEl.textContent = config.title;
        descEl.textContent = config.desc;
        kickerEl.textContent = config.kicker;
        summaryTitleEl.textContent = config.summaryTitle;
        summaryTextEl.textContent = config.summaryText;
        if (pageType === 'cart') {
            primaryCtaEl.innerHTML = `<i class="fas fa-shopping-cart"></i> ${config.primaryLabel}`;
        } else {
            primaryCtaEl.textContent = config.primaryLabel;
        }
        primaryCtaEl.href = config.primaryHref;
        countEl.textContent = `${items.length} ${config.countLabel}${items.length === 1 ? '' : 's'}`;

        if (headerCartCount) {
            const count = Array.isArray(state.cart) ? state.cart.length : 0;
            headerCartCount.textContent = String(count);
            headerCartCount.classList.toggle('has-items', count > 0);
        }

        if (headerWishlistCount) {
            const count = Array.isArray(state.wishlist) ? state.wishlist.length : 0;
            headerWishlistCount.textContent = String(count);
            headerWishlistCount.classList.toggle('has-items', count > 0);
        }

        renderSummary(items);

        if (!items.length) {
            listEl.innerHTML = `
                <div class="saved-empty">
                    ${config.empty}
                    <div style="margin-top:16px;">
                        <a href="index.html#products" class="btn-primary">Browse collection</a>
                    </div>
                </div>
            `;
            return;
        }

        listEl.innerHTML = items.map((item) => {
            const isWishlist = pageType === 'wishlist';
            const primaryAction = isWishlist ? 'move-to-cart' : 'save-for-later';
            const primaryLabel = isWishlist ? 'Add to cart' : 'Save for later';
            const secondaryAction = 'remove';
            const secondaryLabel = 'Remove';
            const measurement = formatMeasurement(item);
            const estimatedPrice = formatEstimatedPrice(item);

            return `
                <article class="saved-card" data-item-key="${item.key}">
                    <img class="saved-card-image" src="${resolveImage(item)}" alt="${item.name}">
                    <div class="saved-card-body">
                        <div class="saved-card-head">
                            <div>
                                <span class="saved-card-category">${item.category}</span>
                                <h3 class="saved-card-title">${item.name}</h3>
                            </div>
                        </div>
                        ${measurement ? `
                            <div class="saved-card-meta">
                                <div class="saved-card-measurement">
                                    <span>Size</span>
                                    <strong>${measurement}</strong>
                                </div>
                                ${estimatedPrice ? `
                                    <div class="saved-card-estimate">
                                        <span>Estimated</span>
                                        <strong>${estimatedPrice}</strong>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                        <p class="saved-card-desc">${item.description}</p>
                        <div class="saved-card-actions">
                            <button type="button" class="btn-primary" data-action="${primaryAction}" data-item-key="${item.key}">${primaryLabel}</button>
                            <button type="button" class="btn-secondary" data-action="${secondaryAction}" data-item-key="${item.key}">${secondaryLabel}</button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        focusItem();
    };

    const closeMobileMenu = () => {
        if (!header || !mobileMenuBtn) return;
        header.classList.remove('menu-open');
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        mobileMenuBtn.setAttribute('aria-label', 'Open menu');
        if (mobileMenuIcon) {
            mobileMenuIcon.className = 'fa-solid fa-bars-staggered';
        }
    };

    const removeFromActiveList = async (itemKey) => {
        if (pageType === 'wishlist' && window.LuxeState?.removeFromWishlist) {
            await window.LuxeState.removeFromWishlist(itemKey);
            return;
        }

        if (pageType === 'cart' && window.LuxeState?.removeFromCart) {
            await window.LuxeState.removeFromCart(itemKey);
        }
    };

    listEl.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;

        const itemKey = button.dataset.itemKey;
        const action = button.dataset.action;
        const state = getCurrentState();
        const activeEntries = Array.isArray(state[pageType]) ? state[pageType] : [];
        const entry = activeEntries.find((current) => getEntryKey(current) === itemKey);
        const card = getCatalogItem(itemKey) || toSavedEntry(entry);
        if (!itemKey || !card) return;

        if (action === 'remove') {
            await removeFromActiveList(itemKey);
            await render();
            return;
        }

        if (pageType === 'wishlist' && action === 'move-to-cart') {
            if (window.LuxeState?.moveToCart) {
                await window.LuxeState.moveToCart(card);
            }
            window.location.href = `cart.html?focus=${encodeURIComponent(itemKey)}`;
            return;
        }

        if (pageType === 'cart' && action === 'save-for-later') {
            if (window.LuxeState?.moveToWishlist) {
                await window.LuxeState.moveToWishlist(card);
            }
            window.location.href = `wishlist.html?focus=${encodeURIComponent(itemKey)}`;
        }
    });

    document.querySelectorAll('.nav-links a').forEach((link) => {
        link.addEventListener('click', () => {
            closeMobileMenu();
        });
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) closeMobileMenu();
    });

    window.addEventListener('luxe-state-changed', () => {
        render().catch(() => {});
    });

    window.addEventListener('pageshow', () => {
        render().catch(() => {});
    });

    render().catch(() => {
        if (!listEl) return;
        listEl.innerHTML = '<div class="saved-empty">Could not load saved items.</div>';
    });
})();
