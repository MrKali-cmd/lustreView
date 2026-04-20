(function () {
    const mountPoint = document.querySelector('[data-site-header]');
    if (!mountPoint) return;

    const page = document.body.dataset.sitePage || 'home';
    const isHomePage = page === 'home';
    const homeHref = isHomePage ? '#home' : 'index.html';
    const aboutHref = isHomePage ? '#about' : 'index.html#about';
    const contactHref = isHomePage ? '#contact' : 'index.html#contact';

    const navItems = [
        { key: 'home', label: 'Home', href: homeHref },
        { key: 'collections', label: 'Collections', href: 'zebra-collection.html' },
        { key: 'about', label: 'About', href: aboutHref },
        { key: 'contact', label: 'Contact', href: contactHref }
    ];

    const activeNavKey = page === 'collection'
        ? 'collections'
        : (page === 'home' ? 'home' : '');

    const navMarkup = navItems.map((item) => `
        <li>
            <a href="${item.href}" class="nav-link-item${item.key === activeNavKey ? ' active' : ''}"${item.key === activeNavKey ? ' aria-current="page"' : ''}>
                ${item.label}
            </a>
        </li>
    `).join('');

    const wishlistCurrent = page === 'wishlist';
    const cartCurrent = page === 'cart';

    mountPoint.innerHTML = `
        <header id="main-header">
            <nav class="nav-container">
                <a href="${isHomePage ? '#' : 'index.html'}" class="logo">
                    <i class="fas fa-feather-pointed"></i>
                    LustreView <span>Blinds</span>
                </a>

                <ul class="nav-links">
                    ${navMarkup}
                </ul>

                <div class="header-actions">
                    <a href="wishlist.html" class="action-item header-wishlist-link${wishlistCurrent ? ' is-current' : ''}" id="wishlist-trigger" aria-label="Open wishlist"${wishlistCurrent ? ' aria-current="page"' : ''}>
                        <i class="fa-regular fa-heart"></i>
                        <span class="action-badge header-wishlist-count" id="wishlist-count" data-wishlist-count>0</span>
                    </a>

                    <a href="cart.html" class="action-item header-cart-link${cartCurrent ? ' is-current' : ''}" id="cart-trigger" aria-label="Open cart"${cartCurrent ? ' aria-current="page"' : ''}>
                        <i class="fas fa-shopping-cart"></i>
                        <span class="action-badge header-cart-count" id="cart-count" data-cart-count>0</span>
                    </a>

                    <button class="mobile-menu-btn" type="button" aria-label="Open menu" aria-expanded="false">
                        <i class="fa-solid fa-bars-staggered"></i>
                    </button>
                </div>
            </nav>
        </header>
    `;

    // Floating promo (more noticeable than a thin header bar).
    const promoDismissed = (() => {
        try {
            return window.localStorage.getItem('luxe_promo_50_dismissed') === '1';
        } catch {
            return false;
        }
    })();

    // Show promo only on public pages (home + collection). Avoid distracting cart/checkout/wishlist.
    const promoAllowed = page === 'home' || page === 'collection';

    if (promoAllowed && !promoDismissed) {
        const promo = document.createElement('div');
        promo.className = 'promo-float';
        promo.setAttribute('role', 'status');
        promo.setAttribute('aria-label', 'Promotion');
        promo.innerHTML = `
            <div class="promo-float__glow" aria-hidden="true"></div>
            <div class="promo-float__card">
                <div class="promo-float__badge">50% OFF</div>
                <div class="promo-float__meta">
                    <div class="promo-float__title">Limited-Time Sale</div>
                    <div class="promo-float__text">Save big on select zebra blinds.</div>
                </div>
                <a class="promo-float__cta" href="zebra-collection.html">Shop Sale</a>
                <button class="promo-float__close" type="button" aria-label="Dismiss promotion" data-promo-close>&times;</button>
            </div>
        `;
        document.body.appendChild(promo);

        const headerEl = document.getElementById('main-header');
        const setPromoTop = () => {
            const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 72;
            // Keep it under the header, centered, with a bit of breathing room.
            promo.style.top = `${Math.max(12, headerHeight + 14)}px`;
        };

        setPromoTop();
        window.addEventListener('resize', setPromoTop);

        // Animate in once per load.
        requestAnimationFrame(() => promo.classList.add('is-visible'));

        promo.querySelector('[data-promo-close]')?.addEventListener('click', () => {
            try {
                window.localStorage.setItem('luxe_promo_50_dismissed', '1');
            } catch {
                // ignore
            }
            promo.classList.remove('is-visible');
            setTimeout(() => promo.remove(), 250);
        });
    }

    const header = mountPoint.querySelector('#main-header');
    if (!header) return;

    const mobileMenuBtn = header.querySelector('.mobile-menu-btn');
    const mobileMenuIcon = mobileMenuBtn?.querySelector('i');
    const wishlistCount = header.querySelector('[data-wishlist-count]');
    const cartCount = header.querySelector('[data-cart-count]');

    const syncCounts = (state = {}) => {
        const wishlistTotal = Array.isArray(state.wishlist) ? state.wishlist.length : 0;
        const cartTotal = Array.isArray(state.cart) ? state.cart.length : 0;

        if (wishlistCount) {
            wishlistCount.textContent = String(wishlistTotal);
            wishlistCount.classList.toggle('has-items', wishlistTotal > 0);
        }

        if (cartCount) {
            cartCount.textContent = String(cartTotal);
            cartCount.classList.toggle('has-items', cartTotal > 0);
        }
    };

    const closeMobileMenu = () => {
        if (!mobileMenuBtn) return;
        header.classList.remove('menu-open');
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        mobileMenuBtn.setAttribute('aria-label', 'Open menu');
        if (mobileMenuIcon) {
            mobileMenuIcon.className = 'fa-solid fa-bars-staggered';
        }
    };

    const toggleMobileMenu = () => {
        if (!mobileMenuBtn) return;
        const isOpen = header.classList.toggle('menu-open');
        mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
        mobileMenuBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        if (mobileMenuIcon) {
            mobileMenuIcon.className = isOpen ? 'fas fa-xmark' : 'fa-solid fa-bars-staggered';
        }
    };

    const attachStateListeners = () => {
        if (window.LuxeState?.ready) {
            window.LuxeState.ready()
                .then((state) => syncCounts(state))
                .catch(() => syncCounts());
        } else {
            syncCounts();
        }

        window.addEventListener('luxe-state-changed', (event) => {
            syncCounts(event.detail || {});
        });

        window.addEventListener('cart-updated', () => {
            if (window.LuxeState?.getSnapshot) {
                syncCounts(window.LuxeState.getSnapshot());
            }
        });

        window.addEventListener('wishlist-updated', () => {
            if (window.LuxeState?.getSnapshot) {
                syncCounts(window.LuxeState.getSnapshot());
            }
        });
    };

    attachStateListeners();
    window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 50);
    });

    mobileMenuBtn?.addEventListener('click', toggleMobileMenu);
    header.querySelectorAll('.nav-links a').forEach((link) => {
        link.addEventListener('click', closeMobileMenu);
    });
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            closeMobileMenu();
        }
    });
})();
