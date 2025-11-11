// Simple test application that outputs JSON logs
// Run this with: node test-app.js

function log(level, message, additionalFields = {}) {
  const logEntry = {
    time: new Date().toISOString(),
    level: level,
    message: message,
    ...additionalFields
  };
  console.log(JSON.stringify(logEntry));
}

console.log('Starting test application...');

// Simulate various log levels
setTimeout(() => {
  log('info', 'Application started', { port: 8080, env: 'development' });
}, 500);

setTimeout(() => {
  log('debug', 'Database connection established', { host: 'localhost', database: 'mydb' });
}, 1000);

setTimeout(() => {
  log('info', 'User logged in', { userId: '12345', username: 'john.doe', ip: '192.168.1.1' });
}, 1500);

setTimeout(() => {
  log('warn', 'High memory usage detected', { memoryUsage: '85%', threshold: '80%' });
}, 2000);

setTimeout(() => {
  log('error', 'Failed to connect to external API', {
    error: 'Connection timeout',
    url: 'https://api.example.com',
    attemptNumber: 3
  });
}, 2500);

setTimeout(() => {
  log('info', 'Request processed successfully', {
    method: 'GET',
    path: '/api/users',
    statusCode: 200,
    duration: '45ms'
  });
}, 3000);

setTimeout(() => {
  log('debug', 'Cache hit', { key: 'user:12345', ttl: 3600 });
}, 3500);

setTimeout(() => {
  log('fatal', 'Critical system failure', {
    error: 'Out of memory',
    availableMemory: '0MB',
    requiredMemory: '256MB'
  });
}, 4000);

setTimeout(() => {
  console.log('Test completed!');
  process.exit(0);
}, 5000);
