const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'admin', 'tailadmin-free-tailwind-dashboard-template-main', 'build');
const targetDir = path.join(rootDir, 'admin', 'panel');

if (!fs.existsSync(sourceDir)) {
  console.error(`❌ Admin build output not found at ${sourceDir}`);
  process.exit(1);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
console.log(`✅ Admin build synced to ${targetDir}`);