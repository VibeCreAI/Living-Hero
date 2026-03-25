/**
 * Downloads the official Ollama binary for the current platform
 * and places it in src-tauri/binaries/ with Tauri's naming convention.
 *
 * Usage: node scripts/bundle-ollama.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const OLLAMA_VERSION = '0.6.2';

const DOWNLOAD_MAP = {
  'x86_64-pc-windows-msvc': {
    url: `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-windows-amd64.exe`,
    ext: '.exe',
  },
  'x86_64-apple-darwin': {
    url: `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin`,
    ext: '',
  },
  'aarch64-apple-darwin': {
    url: `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin`,
    ext: '',
  },
  'x86_64-unknown-linux-gnu': {
    url: `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-linux-amd64`,
    ext: '',
  },
  'aarch64-unknown-linux-gnu': {
    url: `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-linux-arm64`,
    ext: '',
  },
};

function getTargetTriple() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc';
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin';
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin';
  if (platform === 'linux' && arch === 'x64') return 'x86_64-unknown-linux-gnu';
  if (platform === 'linux' && arch === 'arm64') return 'aarch64-unknown-linux-gnu';

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;

    function followRedirects(currentUrl, redirectCount) {
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'));
        return;
      }

      const proto = currentUrl.startsWith('https') ? https : http;
      proto.get(currentUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          followRedirects(response.headers.location, redirectCount + 1);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (totalSize > 0) {
            const pct = ((downloaded / totalSize) * 100).toFixed(1);
            process.stdout.write(`\rDownloading: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('\nDownload complete.');
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {}); // Clean up partial file
        reject(err);
      });
    }

    followRedirects(url, 0);
  });
}

async function main() {
  const targetTriple = getTargetTriple();
  const config = DOWNLOAD_MAP[targetTriple];

  if (!config) {
    console.error(`No Ollama download available for target: ${targetTriple}`);
    process.exit(1);
  }

  const binDir = path.join(__dirname, '..', 'src-tauri', 'binaries');
  fs.mkdirSync(binDir, { recursive: true });

  const filename = `ollama-${targetTriple}${config.ext}`;
  const filepath = path.join(binDir, filename);

  // Skip if already downloaded
  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    if (stats.size > 1024 * 1024) { // > 1MB = real binary
      console.log(`Ollama binary already exists: ${filename} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }
  }

  console.log(`Downloading Ollama v${OLLAMA_VERSION} for ${targetTriple}...`);
  console.log(`URL: ${config.url}`);

  await downloadFile(config.url, filepath);

  // Set executable permission on Unix
  if (os.platform() !== 'win32') {
    fs.chmodSync(filepath, 0o755);
  }

  const stats = fs.statSync(filepath);
  console.log(`Saved: ${filename} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error('Failed to bundle Ollama:', err.message);
  process.exit(1);
});
