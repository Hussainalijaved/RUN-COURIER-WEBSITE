const { spawn } = require('child_process');

const port = process.env.PORT || 5000;

const child = spawn('node', ['dist/index.cjs'], {
  env: { ...process.env, PORT: port, NODE_ENV: 'production' },
  stdio: 'inherit'
});

child.on('close', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code ?? 0);
});
