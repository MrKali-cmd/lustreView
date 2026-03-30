const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const buildVersion =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
  process.env.VERCEL_BUILD_ID ||
  Date.now().toString();

const filesToCopy = [
  'index.html',
  'zebra-collection.html',
  'cart.html',
  'wishlist.html',
  'checkout.html',
  'showroom-3d.html',
  'gemini.html',
  'login.html',
  'admin/index.html',
  'admin/login.html',
  'style.css',
  'saved-pages.css',
  'saved-pages.js',
  'catalog-data.js'
];

const directoriesToCopy = [
  ['portal-7f3a9c', 'portal-7f3a9c'],
  ['admin/panel', 'admin/panel']
];

const ensureParentDir = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

for (const file of filesToCopy) {
  const source = path.join(rootDir, file);
  if (!fs.existsSync(source)) continue;
  const target = path.join(publicDir, file);
  ensureParentDir(target);
  fs.copyFileSync(source, target);
}

for (const [sourceRelative, targetRelative] of directoriesToCopy) {
  const source = path.join(rootDir, sourceRelative);
  if (!fs.existsSync(source)) continue;
  const target = path.join(publicDir, targetRelative);
  ensureParentDir(target);
  fs.cpSync(source, target, { recursive: true });
}

const faviconSourceCandidates = [
  path.join(publicDir, 'admin', 'panel', 'favicon.ico'),
  path.join(rootDir, 'admin', 'panel', 'favicon.ico'),
  path.join(rootDir, 'admin', 'tailadmin-free-tailwind-dashboard-template-main', 'src', 'images', 'favicon.ico')
];

const faviconTarget = path.join(publicDir, 'favicon.ico');
const faviconSource = faviconSourceCandidates.find((candidate) => fs.existsSync(candidate));

if (faviconSource) {
  fs.copyFileSync(faviconSource, faviconTarget);
}

const htmlFilesToVersion = [
  path.join(publicDir, 'index.html'),
  path.join(publicDir, 'zebra-collection.html'),
  path.join(publicDir, 'cart.html'),
  path.join(publicDir, 'wishlist.html'),
  path.join(publicDir, 'checkout.html'),
  path.join(publicDir, 'gemini.html'),
  path.join(publicDir, 'login.html'),
  path.join(publicDir, 'portal-7f3a9c', 'index.html'),
  path.join(publicDir, 'admin', 'index.html'),
  path.join(publicDir, 'admin', 'login.html'),
  path.join(publicDir, 'admin', 'panel', 'index.html'),
  path.join(publicDir, 'admin', 'panel', 'alerts.html'),
  path.join(publicDir, 'admin', 'panel', 'basic-tables.html'),
  path.join(publicDir, 'admin', 'panel', 'signin.html'),
  path.join(publicDir, 'admin', 'panel', 'sidebar.html')
];

const versionedAssets = [
  [/style\.css(?:\?v=[^"]*)?/g, `style.css?v=${buildVersion}`],
  [/saved-pages\.css(?:\?v=[^"]*)?/g, `saved-pages.css?v=${buildVersion}`],
  [/saved-pages\.js(?:\?v=[^"]*)?/g, `saved-pages.js?v=${buildVersion}`],
  [/catalog-data\.js(?:\?v=[^"]*)?/g, `catalog-data.js?v=${buildVersion}`],
  [/bundle\.js(?:\?v=[^"]*)?/g, `bundle.js?v=${buildVersion}`]
];

for (const filePath of htmlFilesToVersion) {
  if (!fs.existsSync(filePath)) continue;
  let html = fs.readFileSync(filePath, 'utf8');
  for (const [pattern, target] of versionedAssets) {
    html = html.replace(pattern, target);
  }
  fs.writeFileSync(filePath, html);
}

console.log(`Public site prepared at ${publicDir} with version ${buildVersion}`);
