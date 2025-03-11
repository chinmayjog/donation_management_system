// test-connectivity.js
const http = require('http');

const options = {
  hostname: 'auth-service',
  port: 3001,
  path: '/',
  method: 'GET'
};

console.log('Testing connection to auth-service:3001...');

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();