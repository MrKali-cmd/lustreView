const fs = require('fs');
const path = require('path');

// Files that must exist at the repo root and will be copied to /public for Vercel hosting.
const FILES = [
  'index.html',
  'style.css',
  'wishlist.html',
  'cart.html',
  'checkout.html',
  'contact.html',
  'faq.html',
  'login.html',
  'order-success.html',
  'privacy.html',
  'terms.html',
  'shipping-returns.html',
  'showroom-3d.html',
  'zebra-collection.html',
  'blog.html',
  'cookies.html',
  'site-header.js',
  'site-state.js',
  'catalog-data.js',
  'saved-pages.css',
  'saved-pages.js'
];

const DEST_DIR = 'public';

const copyDirRecursive = (srcDir, destDir) => {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
      continue;
    }
    if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

try {
  const cwd = process.cwd();
  const rootFiles = fs.readdirSync(cwd);

  fs.mkdirSync(path.join(cwd, DEST_DIR), { recursive: true });

  for (const f of FILES) {
    // Case-insensitive lookup (Windows dev), but emit a stable lowercase path in /public (Linux/Vercel).
    const actualFile = rootFiles.find((name) => name.toLowerCase() === f.toLowerCase());
    if (!actualFile) {
      console.error(`[build] Missing essential file: ${f}`);
      process.exit(1);
    }

    const src = path.join(cwd, actualFile);
    const target = path.join(cwd, DEST_DIR, f.toLowerCase());
    fs.copyFileSync(src, target);
  }

  // Static assets used by the site (index.html references /img/*).
  copyDirRecursive(path.join(cwd, 'img'), path.join(cwd, DEST_DIR, 'img'));

  console.log(`[build] Public site prepared at ${path.join(cwd, DEST_DIR)}`);
} catch (error) {
  console.error('[build] prepare-public failed:', error);
  process.exit(1);
}
