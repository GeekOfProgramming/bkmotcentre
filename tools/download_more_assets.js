const https = require('https');
const fs = require('fs');

const missingImages = [
  '08/mechanic-05.jpg',
  '08/mechanic-34.png',
  '08/mechanic-35.png',
  '08/mechanic-58.jpg',
  '08/mechanic-87.jpg'
];

const baseUrl = 'https://bkmotcentreltd.co.uk/wp-content/uploads/2019/';

missingImages.forEach(img => {
  const fn = img.split('/')[1];
  const url = baseUrl + img;
  const dest = 'assets/images/' + fn;
  const file = fs.createWriteStream(dest);
  
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    if (res.statusCode === 200) {
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('Downloaded:', fn);
      });
    } else {
      console.log('Failed (' + res.statusCode + '):', fn);
    }
  }).on('error', err => console.error(err.message));
});
