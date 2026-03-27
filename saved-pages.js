(function () {
    const catalog = Array.isArray(window.LUXE_CATALOG) ? window.LUXE_CATALOG : [];
    const pageType = document.body.dataset.savedPage || 'wishlist';
    const storageKeys = { wishlist: 'luxeFavorites', cart: 'luxeCart' };
    const otherKeys = { wishlist: 'luxeCart', cart: 'luxeFavorites' };
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
            desc: 'Review the items you are ready to request. You can remove pieces, move them back to your wishlist, or continue to the quote form.',
            countLabel: 'cart item',
            empty: 'Your cart is empty. Tap the cart icon on any product to add it here.',
            summaryTitle: 'Cart summary',
            summaryText: 'Use the cart to keep a clean shortlist before sending a request.',
            summaryValueLabel: 'Subtotal',
            primaryLabel: 'Request Quote',
            primaryHref: 'index.html#contact'
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
    let focusTimer = null;
    const USD_RATE = 42000;

    const readSet = (key) => {
        try {
            return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
        } catch {
            return new Set();
        }
    };

    const writeSet = (key, set) => {
        localStorage.setItem(key, JSON.stringify(Array.from(set)));
    };

    const toUsd = (value) => Number(value || 0) / USD_RATE;
    const formatPrice = (rawValue) => `$${toUsd(rawValue).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;

    const getCatalogItem = (key) => catalog.find((item) => item.key === key) || null;

    const renderSummary = (items) => {
        const total = items.reduce((sum, item) => sum + toUsd(Number(item.price) || 0), 0);
        summaryCountEl.textContent = `${items.length} ${config.countLabel}${items.length === 1 ? '' : 's'}`;
        summaryValueLabelEl.textContent = config.summaryValueLabel;
        summaryValueEl.textContent = `$${total.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
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

    const render = () => {
        const activeSet = readSet(storageKeys[pageType] || storageKeys.wishlist);
        const items = Array.from(activeSet)
            .map(getCatalogItem)
            .filter(Boolean);

        titleEl.textContent = config.title;
        descEl.textContent = config.desc;
        kickerEl.textContent = config.kicker;
        summaryTitleEl.textContent = config.summaryTitle;
        summaryTextEl.textContent = config.summaryText;
        primaryCtaEl.textContent = config.primaryLabel;
        primaryCtaEl.href = config.primaryHref;
        countEl.textContent = `${items.length} ${config.countLabel}${items.length === 1 ? '' : 's'}`;

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

            return `
                <article class="saved-card" data-item-key="${item.key}">
                    <img class="saved-card-image" src="${item.image}" alt="${item.name}">
                    <div class="saved-card-body">
                        <div class="saved-card-head">
                            <div>
                                <span class="saved-card-category">${item.category}</span>
                                <h3 class="saved-card-title">${item.name}</h3>
                            </div>
                            <div class="saved-card-price">${formatPrice(item.price)}</div>
                        </div>
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
            mobileMenuIcon.className = 'fas fa-bars';
        }
    };

    const toggleMobileMenu = () => {
        if (!header || !mobileMenuBtn) return;
        const isOpen = header.classList.toggle('menu-open');
        mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
        mobileMenuBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        if (mobileMenuIcon) {
            mobileMenuIcon.className = isOpen ? 'fas fa-xmark' : 'fas fa-bars';
        }
        console.log('[mobile-menu] toggle', {
            page: window.location.pathname,
            isOpen,
            headerClass: header.className,
            buttonAriaExpanded: mobileMenuBtn.getAttribute('aria-expanded')
        });
    };

    const moveBetweenLists = (sourceKey, targetKey, itemKey) => {
        const sourceSet = readSet(sourceKey);
        const targetSet = readSet(targetKey);
        sourceSet.delete(itemKey);
        targetSet.add(itemKey);
        writeSet(sourceKey, sourceSet);
        writeSet(targetKey, targetSet);
    };

    const removeFromActiveList = (itemKey) => {
        const activeKey = storageKeys[pageType] || storageKeys.wishlist;
        const activeSet = readSet(activeKey);
        activeSet.delete(itemKey);
        writeSet(activeKey, activeSet);
    };

    listEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;

        const itemKey = button.dataset.itemKey;
        const action = button.dataset.action;
        const activeKey = storageKeys[pageType] || storageKeys.wishlist;
        const oppositeKey = otherKeys[pageType] || otherKeys.wishlist;

        if (action === 'remove') {
            removeFromActiveList(itemKey);
            render();
            return;
        }

        if (pageType === 'wishlist' && action === 'move-to-cart') {
            moveBetweenLists(activeKey, oppositeKey, itemKey);
            window.location.href = `cart.html?focus=${encodeURIComponent(itemKey)}`;
            return;
        }

        if (pageType === 'cart' && action === 'save-for-later') {
            moveBetweenLists(activeKey, oppositeKey, itemKey);
            window.location.href = `wishlist.html?focus=${encodeURIComponent(itemKey)}`;
        }
    });

    mobileMenuBtn?.addEventListener('click', toggleMobileMenu);
    if (mobileMenuBtn) {
        console.log('[mobile-menu] init', {
            page: window.location.pathname,
            buttonFound: true,
            headerClass: header?.className || '',
            buttonRect: mobileMenuBtn.getBoundingClientRect()
        });
        document.addEventListener('click', (event) => {
            const clickedMenu = event.target.closest('.mobile-menu-btn');
            const clickedHeader = event.target.closest('header');
            if (!clickedMenu && !clickedHeader) return;
            const topElement = document.elementFromPoint(event.clientX, event.clientY);
            console.log('[mobile-menu] click', {
                page: window.location.pathname,
                targetTag: event.target.tagName,
                targetClass: event.target.className,
                clickedMenu: Boolean(clickedMenu),
                clickedHeader: Boolean(clickedHeader),
                topElementTag: topElement?.tagName || null,
                topElementClass: topElement?.className || null,
                headerClass: header?.className || '',
                buttonRect: mobileMenuBtn.getBoundingClientRect()
            });
        }, true);
    } else {
        console.warn('[mobile-menu] init failed', {
            page: window.location.pathname,
            buttonFound: false
        });
    }
    document.querySelectorAll('.nav-links a').forEach((link) => {
        link.addEventListener('click', () => {
            closeMobileMenu();
        });
    });
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) closeMobileMenu();
    });

    render();
})();
