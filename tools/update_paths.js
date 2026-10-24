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
  [ /href="index\.html"/g, 'href="/"' ],
  [ /href="aboutus\.html"/g, 'href="/aboutus/"' ],
  [ /href="services\.html"/g, 'href="/services/"' ],
  [ /href="dpf-cleaning-service\.html"/g, 'href="/dpf-cleaning-service/"' ],
  [ /href="contactus\.html"/g, 'href="/contactus/"' ],
  [ /href="css\//g, 'href="/css/' ],
  [ /href="favicon\.png"/g, 'href="/favicon.png"' ],
  [ /src="js\//g, 'src="/js/' ],
  [ /src="assets\//g, 'src="/assets/' ]
];

files.forEach(f => {
  const p = path.join(rootDir, f);
  if (!fs.existsSync(p)) {
    console.log('Skipping missing:', f);
    return;
  }
  let content = fs.readFileSync(p, 'utf8');
  replacements.forEach(([pattern, replacement]) => {
    content = content.replace(pattern, replacement);
  });
  fs.writeFileSync(p, content, 'utf8');
  console.log('Successfully updated:', f);
});
