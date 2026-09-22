#!/usr/bin/env node
// Мини-сервер для готовой сборки (dist/) без зависимостей — подходит для Termux.
// Использование: node server.js [--port 8000] [--listen] [--no-open]
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const port = Number(opt('--port', process.env.PORT || 8000));
// --listen открывает доступ с других устройств в локальной сети
const host = args.includes('--listen') ? '0.0.0.0' : '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error('Нет сборки dist/. Выполните: npm install && npm run build:web   (или ./start.sh)');
  process.exit(1);
}

const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const ext = extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    // хэшированные ассеты кэшируем надолго, index.html — нет
    'Cache-Control': file.includes(`${join(root, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Порт ${port} занят. Запустите с другим: node server.js --port 8001`);
  else console.error(e);
  process.exit(1);
});

server.listen(port, host, () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`\n  ✦ Divinax запущен: ${url}`);
  if (host === '0.0.0.0') {
    for (const list of Object.values(networkInterfaces()))
      for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`    в локальной сети: http://${n.address}:${port}`);
  }
  console.log('  Остановить: Ctrl+C\n');
  // В Termux сразу открываем браузер
  if (!args.includes('--no-open') && process.env.PREFIX?.includes('com.termux')) exec(`termux-open-url ${url}`, () => {});
});
