// The game's own web files served to the emulator (node server.mjs <repo root> <state dir>). A file "mode" in the
// state dir switches behaviour: "normal" serves the files; "portal" answers every request with a captive portal's
// sign-in page, the way a hotel or café Wi-Fi does before you log in. Every request is appended to requests.log.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [root, state] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const PORTAL = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><title>Sign in to Wi-Fi</title></head>'
  + '<body style="font-family:sans-serif;padding:24px"><h1>Welcome to CoffeeNet</h1><p>Sign in to Wi-Fi to continue.</p><form><button>Accept terms</button></form></body></html>';
const mode = () => { try { return fs.readFileSync(path.join(state, 'mode'), 'utf8').trim(); } catch { return 'normal'; } };
http.createServer((req, res) => {
  fs.appendFileSync(path.join(state, 'requests.log'), `${req.method} ${req.url}\n`);
  if (mode() === 'portal') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(PORTAL); return; }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const fp = path.resolve(root, '.' + p);
  if (!fp.startsWith(path.resolve(root))) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d);
  });
}).listen(8080, () => console.log('test server on 8080, mode', mode()));
