#!/usr/bin/env node
// serve.js — the site the way GitHub Pages serves it, on your machine.
// Zero dependencies. `node serve.js` (or `npm run serve`), then open
// http://localhost:8080. Pass a port to override: `node serve.js 3000`.
//
// You don't need this to read the site — every page opens from file://.
// You DO need it for the Ariadne fellowship signal (two tabs finding each
// other over BroadcastChannel needs a real origin, and file:// isn't one).

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8080;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    // Resolve inside ROOT only — no traversal.
    const filePath = path.join(ROOT, path.normalize(urlPath));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('no'); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`404 — no ${urlPath} here.\nthe forest is at /\n`);
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`servingkaos — http://localhost:${PORT}`);
    console.log('the forest is at /, the instrument at /ariadne.html');
});
