const https = require('https');

const options = {
  hostname: 'bkmotcentreltd.co.uk',
  path: '/',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
};

https.get(options, (res) => {
  console.log('Status code:', res.statusCode);
  console.log('Headers:', res.headers.location);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Body length:', data.length);
    const matches = data.match(/wp-content\/uploads\/[^\s"'<>]+/gi) || [];
    console.log('Matches:', [...new Set(matches)]);
  });
}).on('error', err => {
  console.error('Error:', err.message);
});
