const https = require('https');
const fs = require('fs');

const options = {
  hostname: 'bkmotcentreltd.co.uk',
  path: '/wp-content/cache/et/2/et-core-unified-17911188624778.min.css',
  headers: { 'User-Agent': 'Mozilla/5.0' }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('tools/divi_styles.css', data);
    console.log('Saved divi_styles.css, length:', data.length);
  });
}).on('error', err => console.error(err));
