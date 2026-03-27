const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(buildDir)) {
  throw new Error(`Build output not found at ${buildDir}`);
}

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.cpSync(buildDir, publicDir, { recursive: true });

console.log(`TailAdmin build copied to ${publicDir}`);
