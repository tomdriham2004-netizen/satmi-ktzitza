// Production server: serves the built game from dist/ and hosts online rooms
// on the same port.  npm run build && npm start   (port 80 by default; override with PORT)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachRooms } from "./rooms.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 80;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/health') { res.writeHead(200); res.end('ok'); return; }
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' || ext === '.webmanifest' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(file).pipe(res);
});

attachRooms(server, { log: (m) => console.log(`[rooms] ${m}`) });
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use (IIS or another web server?). Stop it, or run with a different PORT.`);
  else if (err.code === 'EACCES') console.error(`No permission to use port ${PORT}. Run as administrator, or use a different PORT.`);
  else console.error(err);
  process.exit(1);
});
server.listen(PORT, () => console.log(`BOOMTOWN running on http://localhost${PORT === 80 ? '' : `:${PORT}`}`));
