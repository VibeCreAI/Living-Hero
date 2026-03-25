/**
 * Creates a minimal placeholder sidecar binary so Tauri compiles in dev mode.
 * In dev, the developer runs `ollama serve` manually.
 *
 * Usage: node scripts/setup-dev-sidecar.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const binDir = path.join(__dirname, '..', 'src-tauri', 'binaries');
fs.mkdirSync(binDir, { recursive: true });

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

function createMinimalPE() {
  // Minimal valid Windows PE executable (exits immediately)
  // This is a well-known minimal PE that just calls ExitProcess(0)
  const buf = Buffer.alloc(512, 0);

  // DOS header
  buf.write('MZ', 0, 'ascii');
  buf.writeUInt32LE(0x80, 0x3c); // e_lfanew: PE header at offset 0x80

  // PE signature
  buf.write('PE\0\0', 0x80, 'ascii');

  // COFF header
  buf.writeUInt16LE(0x8664, 0x84); // Machine: AMD64
  buf.writeUInt16LE(0, 0x86); // NumberOfSections: 0
  buf.writeUInt16LE(0xf0, 0x94); // SizeOfOptionalHeader
  buf.writeUInt16LE(0x22, 0x96); // Characteristics: EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE

  // Optional header
  buf.writeUInt16LE(0x20b, 0x98); // Magic: PE32+
  buf.writeUInt32LE(0x200, 0xb0); // SizeOfHeaders
  buf.writeUInt32LE(0x200, 0xd8); // SizeOfImage
  buf.writeUInt16LE(3, 0xc4); // Subsystem: CONSOLE

  return buf;
}

const targetTriple = getTargetTriple();
const ext = os.platform() === 'win32' ? '.exe' : '';
const filename = `ollama-${targetTriple}${ext}`;
const filepath = path.join(binDir, filename);

if (fs.existsSync(filepath)) {
  const stats = fs.statSync(filepath);
  // If the file is larger than 1KB, it's probably a real Ollama binary — don't overwrite
  if (stats.size > 1024) {
    console.log(`Skipping: ${filename} appears to be a real binary (${stats.size} bytes)`);
    process.exit(0);
  }
}

if (os.platform() === 'win32') {
  fs.writeFileSync(filepath, createMinimalPE());
} else {
  fs.writeFileSync(
    filepath,
    '#!/bin/sh\necho "Dev placeholder - run ollama serve manually"\nexit 1\n'
  );
  fs.chmodSync(filepath, 0o755);
}

console.log(`Created dev sidecar placeholder: ${filename}`);
