const https = require('https');
const fs = require('fs');

https.get({
  hostname: 'bkmotcentreltd.co.uk',
  path: '/',
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('tools/live_home.html', data);
    console.log('Saved live_home.html, length:', data.length);
  });
});
