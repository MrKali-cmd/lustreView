const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const adminDir = path.join(rootDir, 'admin', 'tailadmin-free-tailwind-dashboard-template-main');
const serverDir = path.join(rootDir, 'server');

const run = (label, command, args, options) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });

  return child;
};

run('admin', 'npm', ['run', 'start'], {
  cwd: adminDir,
  env: { ...process.env, PORT: '3000' }
});

run('api', 'npm', ['run', 'dev'], {
  cwd: serverDir,
  env: { ...process.env, PORT: '3001' }
});