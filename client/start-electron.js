const { spawn } = require('child_process');
const electron = require('electron');

console.log('Spawning true Electron binary at:', electron);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: {
    ...env,
    NODE_ENV: 'development',
  }
});

child.on('close', (code) => {
  process.exit(code);
});
