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
    const rootFiles = fs.readdirSync(process.cwd());
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    files.forEach(f => {
        // پیدا کردن فایل بدون حساسیت به حروف کوچک و بزرگ
        const actualFile = rootFiles.find(name => name.toLowerCase() === f.toLowerCase());

        if (actualFile) {
            const src = path.join(process.cwd(), actualFile);
            const target = path.join(process.cwd(), dest, f.toLowerCase());

            fs.copyFileSync(src, target);
            if (actualFile !== f.toLowerCase()) {
                console.log(`ℹ️ Auto-fixed casing: ${actualFile} -> ${dest}/${f.toLowerCase()}`);
            }
        } else {
            console.error(`❌ Missing file: ${f}`);
            process.exit(1);
        }
    });
    console.log(`✅ Public directory ready at ${new Date().toLocaleTimeString()}`);
} catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
}