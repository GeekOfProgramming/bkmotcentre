const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const files = [
  'index.html',
  'aboutus/index.html',
  'services/index.html',
  'dpf-cleaning-service/index.html',
  'contactus/index.html'
];

const replacements = [
  [ /href="https:\/\/bkmotcentreltd\.co\.uk\/aboutus\.html"/g, 'href="https://bkmotcentreltd.co.uk/aboutus/"' ],
  [ /href="https:\/\/bkmotcentreltd\.co\.uk\/services\.html"/g, 'href="https://bkmotcentreltd.co.uk/services/"' ],
  [ /href="https:\/\/bkmotcentreltd\.co\.uk\/dpf-cleaning-service\.html"/g, 'href="https://bkmotcentreltd.co.uk/dpf-cleaning-service/"' ],
  [ /href="https:\/\/bkmotcentreltd\.co\.uk\/contactus\.html"/g, 'href="https://bkmotcentreltd.co.uk/contactus/"' ],
  [ /url\('assets\/images\//g, "url('/assets/images/" ],
  [ /url\("assets\/images\//g, 'url("/assets/images/' ]
];

files.forEach(f => {
  const p = path.join(rootDir, f);
  if (!fs.existsSync(p)) return;
  let content = fs.readFileSync(p, 'utf8');
  replacements.forEach(([pattern, replacement]) => {
    content = content.replace(pattern, replacement);
  });
  fs.writeFileSync(p, content, 'utf8');
  console.log('Fixed URLs in:', f);
});
