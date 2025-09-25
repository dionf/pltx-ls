const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Lightspeed Import Application...');

// Start backend
console.log('📡 Starting backend server...');
const backend = spawn('node', ['index.js'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'inherit'
});

// Start frontend after a short delay
setTimeout(() => {
  console.log('🌐 Starting frontend server...');
  const frontend = spawn('npm', ['start'], {
    cwd: path.join(__dirname, 'frontend'),
    stdio: 'inherit',
    shell: true
  });
}, 3000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down servers...');
  backend.kill();
  process.exit(0);
});

console.log('✅ Application started!');
console.log('📡 Backend: http://localhost:4000');
console.log('🌐 Frontend: http://localhost:3000');
console.log('Press Ctrl+C to stop');


