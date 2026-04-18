const fs = require('fs');
const path = require('path');

const files = [
    'index.html', 'style.css', 'wishlist.html', 'cart.html', 'checkout.html',
    'contact.html', 'faq.html', 'login.html', 'order-success.html',
    'privacy.html', 'terms.html', 'shipping-returns.html', 'showroom-3d.html',
    'zebra-collection.html', 'blog.html', 'cookies.html', 'site-header.js',
    'site-state.js', 'catalog-data.js', 'saved-pages.css', 'saved-pages.js'
];

const dest = 'public';

try {
    // Create public directory if it doesn't exist
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    files.forEach(f => {
        const src = path.join(process.cwd(), f);
        const target = path.join(process.cwd(), dest, f);

        if (fs.existsSync(src)) {
            fs.copyFileSync(src, target);
            console.log(`Successfully copied: ${f}`);
        } else {
            console.warn(`⚠️ Warning: File not found, skipping: ${f}`);
        }
    });
    console.log(`✅ DONE: Public directory ready at ${new Date().toISOString()}`);
} catch (error) {
    console.error('❌ Build process failed:', error);
    process.exit(1);
}