/**
 * BK MOT Centre - Static Template Compiler & Watcher
 * Zero third-party runtime dependencies, runs in native Node.js.
 * Reads templates from src/pages/ and injects components/header.html & components/footer.html
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT_DIR, 'components');
const SRC_PAGES_DIR = path.join(ROOT_DIR, 'src', 'pages');

const PAGES_CONFIG = [
  { src: 'index.html', dest: 'index.html', active: 'home' },
  { src: 'aboutus.html', dest: 'aboutus/index.html', active: 'about' },
  { src: 'dpf-cleaning-service.html', dest: 'dpf-cleaning-service/index.html', active: 'dpf' },
  { src: 'services.html', dest: 'services/index.html', active: 'services' },
  { src: 'contactus.html', dest: 'contactus/index.html', active: 'contact' }
];

function getHeader(activePage) {
  const headerPath = path.join(COMPONENTS_DIR, 'header.html');
  let headerHtml = fs.readFileSync(headerPath, 'utf8');

  // Replace active links
  const activeKeys = {
    home: 'isHome',
    about: 'isAbout',
    dpf: 'isDpf',
    services: 'isServices',
    contact: 'isContact'
  };

  for (const [key, placeholder] of Object.entries(activeKeys)) {
    const regex = new RegExp(`\\{\\{#if ${placeholder}\\}\\}\\s*active\\{\\{/if\\}\\}`, 'g');
    headerHtml = headerHtml.replace(regex, key === activePage ? ' active' : '');
  }

  return headerHtml;
}

function getFooter() {
  const footerPath = path.join(COMPONENTS_DIR, 'footer.html');
  return fs.readFileSync(footerPath, 'utf8');
}

function buildPage(page) {
  const srcPath = path.join(SRC_PAGES_DIR, page.src);
  const destPath = path.join(ROOT_DIR, page.dest);

  if (!fs.existsSync(srcPath)) {
    console.warn(`[Build] Source page missing: ${srcPath}`);
    return;
  }

  let content = fs.readFileSync(srcPath, 'utf8');
  const headerHtml = getHeader(page.active);
  const footerHtml = getFooter();

  // Inject header component
  content = content.replace(/<!--\s*@include:\s*header\s*-->/g, headerHtml);
  // Inject footer component
  content = content.replace(/<!--\s*@include:\s*footer\s*-->/g, footerHtml);

  // Ensure dest directory exists
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.writeFileSync(destPath, content, 'utf8');
  console.log(`[Build] Generated: ${page.dest}`);
}

function buildAll() {
  console.log('[Build] Compiling pages with modular header and footer...');
  for (const page of PAGES_CONFIG) {
    buildPage(page);
  }
  console.log('[Build] All pages built successfully!');
}

function watch() {
  buildAll();
  console.log('[Watch] Watching components and src/pages for changes...');

  const watchDirs = [COMPONENTS_DIR, SRC_PAGES_DIR];
  for (const dir of watchDirs) {
    if (fs.existsSync(dir)) {
      fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith('.html') || filename.endsWith('.htm'))) {
          console.log(`[Watch] File changed: ${filename}. Rebuilding...`);
          try {
            buildAll();
          } catch (err) {
            console.error('[Watch] Error during build:', err.message);
          }
        }
      });
    }
  }
}

if (process.argv.includes('--watch')) {
  watch();
} else {
  buildAll();
}

module.exports = { buildAll };
