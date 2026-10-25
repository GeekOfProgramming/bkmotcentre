/**
 * BK MOT Centre - Dedicated Static Build Pipeline & Watcher
 * Zero third-party runtime dependencies, runs in native Node.js.
 * Compiles templates from src/pages/ with components into dist/,
 * copies static assets, and applies cache-busting hashes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const COMPONENTS_DIR = path.join(ROOT_DIR, 'components');
const SRC_PAGES_DIR = path.join(ROOT_DIR, 'src', 'pages');

function getAssetHash(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(data).digest('hex').slice(0, 8);
  } catch {
    return '1.0.0';
  }
}

const PAGES_CONFIG = [
  { src: 'index.html', dest: 'index.html', active: 'home' },
  { src: 'aboutus.html', dest: 'aboutus/index.html', active: 'about' },
  { src: 'dpf-cleaning-service.html', dest: 'dpf-cleaning-service/index.html', active: 'dpf' },
  { src: 'services.html', dest: 'services/index.html', active: 'services' },
  { src: 'contactus.html', dest: 'contactus/index.html', active: 'contact' },
  { src: '404.html', dest: '404.html', active: '' }
];

const STATIC_DIRECTORIES = ['css', 'js', 'assets'];

const STATIC_FILES = [
  'favicon.png',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml',
  '_headers',
  '_redirects'
];

function getHeader(activePage) {
  const headerPath = path.join(COMPONENTS_DIR, 'header.html');
  let headerHtml = fs.readFileSync(headerPath, 'utf8');

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

function buildPage(page, jsHash, cssHash) {
  const srcPath = path.join(SRC_PAGES_DIR, page.src);
  const destPath = path.join(DIST_DIR, page.dest);

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

  // Asset Cache Versioning
  content = content.replace(/(["'])\/js\/main\.js(?:\?[^"']*)?\1/g, `$1/js/main.js?v=${jsHash}$1`);
  content = content.replace(/(["'])\/css\/style\.css(?:\?[^"']*)?\1/g, `$1/css/style.css?v=${cssHash}$1`);

  // Ensure destination directory exists in dist/
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.writeFileSync(destPath, content, 'utf8');
  console.log(`[Build] Generated: dist/${page.dest}`);
}

function copyStaticAssets() {
  // Copy static directories into dist/
  for (const dir of STATIC_DIRECTORIES) {
    const srcDir = path.join(ROOT_DIR, dir);
    const destDir = path.join(DIST_DIR, dir);
    if (fs.existsSync(srcDir)) {
      fs.cpSync(srcDir, destDir, { recursive: true });
      console.log(`[Build] Copied directory: ${dir} -> dist/${dir}`);
    }
  }

  // Copy root static configuration and discovery files
  for (const file of STATIC_FILES) {
    const srcFile = path.join(ROOT_DIR, file);
    const destFile = path.join(DIST_DIR, file);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
      console.log(`[Build] Copied file: ${file} -> dist/${file}`);
    }
  }
}

function buildAll() {
  console.log('[Build] Starting clean build to dist/...');

  // Initialize fresh dist/ directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Copy static directories and configuration files
  copyStaticAssets();

  // Compute hashes from source assets
  const jsHash = getAssetHash(path.join(ROOT_DIR, 'js', 'main.js'));
  const cssHash = getAssetHash(path.join(ROOT_DIR, 'css', 'style.css'));

  // Compile HTML pages into dist/
  for (const page of PAGES_CONFIG) {
    buildPage(page, jsHash, cssHash);
  }

  console.log('[Build] All assets compiled and assembled in dist/ successfully!');
}

function watch() {
  buildAll();
  console.log('[Watch] Watching components, src/pages, css, js, assets for changes...');

  const watchDirs = [
    COMPONENTS_DIR,
    SRC_PAGES_DIR,
    path.join(ROOT_DIR, 'css'),
    path.join(ROOT_DIR, 'js'),
    path.join(ROOT_DIR, 'assets')
  ];

  for (const dir of watchDirs) {
    if (fs.existsSync(dir)) {
      fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename && !filename.includes('.git') && !filename.includes('dist')) {
          console.log(`[Watch] File changed: ${filename}. Rebuilding to dist/...`);
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

if (require.main === module) {
  if (process.argv.includes('--watch')) {
    watch();
  } else {
    buildAll();
  }
}

module.exports = { buildAll, DIST_DIR, PAGES_CONFIG };
