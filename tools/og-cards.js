#!/usr/bin/env node
// tools/og-cards.js — one share card per page, so a link to the garage
// unfurls as the garage and not as the front door.
//
//   npm run cards        → writes og/<page>.png at 1200×630
//
// The words on each card are read from the page's own og:title and
// og:description, so a card can't drift from its page — change the page,
// rerun this, commit the png. The only thing decided here is which ring
// a page belongs to.
//
// Six dots ride the top of every card, one per ring. A page lights its own.
// Kansas lights none: that page is about hiding the gap, so the card does.
//
// Stars are seeded from the page name — rerunning changes no pixels unless
// the words changed. Renders with your installed Chrome (same as the gate),
// in the first monospace it finds; regenerate on the Mac so SF Mono holds.

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const OUT = path.join(SITE, 'og');

// Drawn left to right in this order. A picture puts the gap BETWEEN what
// you want and what is — that's what a gap is. (The sentence on the footer,
// *want* {is} [gap], keeps its own order: a sentence lands on the gap.)
const RINGS = {
    intent:  '#ffd700',
    gap:     '#5b8def',
    reality: '#4ecdc4',
    cross:   '#e07bda',
    pin:     '#ff6b6b',
    aether:  '#a0dca0',
};

// page → the ring(s) it lights, and the ink its title is set in.
// index.html and 404.html share the site-wide og-card.png, printed by
// siteCard() below — its source was never committed, so now it has one.
const PAGES = {
    'slideshow.html':  { lit: ['reality'] },                 // the proof
    'honeytree.html':  { lit: ['intent'] },                  // the feeling
    'spirittree.html': { lit: ['cross'] },                   // the thread
    'worldtree.html':  { lit: ['aether'] },                  // the caterpillar
    'dale.html':       { lit: ['pin'] },                     // pins never decay
    'volume.html':     { lit: ['intent', 'pin'] },           // MAXIMUM gold, VOLUME red
    'why.html':        { lit: ['reality'] },                 // real answers
    'proofs.html':     { lit: ['reality'] },                 // the receipts
    'ariadne.html':    { lit: ['aether'] },                  // the instrument
    'rings.html':      { lit: ['intent', 'reality', 'gap'], ink: '#cccccc' },
    'kansas.html':     { lit: [], ink: '#999999' },          // the gap, hidden
};

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        '/opt/pw-browsers/chromium',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
    ].filter(Boolean);
    for (const c of candidates) if (fs.existsSync(c)) return c;
    console.error('No Chrome/Chromium found. Set CHROME_PATH=/path/to/chrome and rerun.');
    process.exit(2);
}

function meta(html, prop) {
    const m = html.match(new RegExp(`property="og:${prop}" content="([^"]*)"`));
    return m ? m[1] : '';
}

// The meta values are already HTML-escaped attribute text; they go back into
// HTML untouched. Everything else in the template is ours.
function card(slug, title, desc, { lit, ink }) {
    const titleInk = ink || RINGS[lit[0]];
    const dots = Object.entries(RINGS).map(([ring, color]) => lit.includes(ring)
        ? `<i style="background:${color}; box-shadow:0 0 70px 26px ${color}38, 0 0 18px 2px ${color}88;"></i>`
        : `<i style="background:${color}; opacity:0.16;"></i>`).join('<b></b>');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { width:1200px; height:630px; background:#080816; overflow:hidden;
               font-family:'SF Mono','Menlo','Consolas',monospace; position:relative; }
        canvas { position:absolute; inset:0; }
        .card { position:absolute; inset:0; display:flex; flex-direction:column;
                align-items:center; justify-content:center; padding:0 80px 40px; text-align:center; }
        .dots { display:flex; align-items:center; margin-bottom:64px; }
        .dots i { width:22px; height:22px; border-radius:50%; display:block; }
        .dots b { width:44px; height:1px; background:rgba(255,255,255,0.07); display:block; }
        h1 { font-weight:200; letter-spacing:0.12em; margin-right:-0.12em; white-space:nowrap;
             color:${titleInk}; font-size:84px; line-height:1.15; }
        p { margin-top:34px; max-width:900px; font-size:27px; line-height:1.6;
            font-style:italic; color:#7a7a86; }
        .foot { position:absolute; left:80px; right:80px; bottom:44px; display:flex;
                justify-content:space-between; font-size:19px; letter-spacing:0.12em; color:#4a4a58; }
        .foot span span { margin-left:18px; }
    </style></head><body>
    <canvas id="sky" width="1200" height="630"></canvas>
    <div class="card">
        <div class="dots">${dots}</div>
        <h1 id="t">${title}</h1>
        <p>${desc}</p>
    </div>
    <div class="foot">
        <span>servingkaos.com</span>
        <span><span style="color:#ffd700">*want*</span><span style="color:#4ecdc4">{is}</span><span style="color:#5b8def">[gap]</span></span>
    </div>
    <script>{
        // Block-scoped on purpose: setContent reuses the window, so a bare
        // top-level let is "already declared" on the second card and the
        // whole script dies — no stars, no fit. It shipped that way for a minute.
        // mulberry32, seeded from the page name — same sky every run.
        let seed =[...${JSON.stringify(slug)}].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 0x9e3779b9);
        const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        const ctx = document.getElementById('sky').getContext('2d');
        for (let i = 0; i < 260; i++) {
            ctx.beginPath();
            ctx.arc(rnd() * 1200, rnd() * 630, rnd() * 1.3 + 0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(200,210,255,' + (rnd() * 0.32 + 0.05) + ')';
            ctx.fill();
        }
        // Shrink the title until it fits — measured, so a fallback font still fits.
        const t = document.getElementById('t');
        let size = 84;
        while (t.scrollWidth > 1040 && size > 30) t.style.fontSize = (--size) + 'px';
    }</script></body></html>`;
}

// The front door's card: the three rings alone, large, the gap between.
function siteCard() {
    const three = ['intent', 'gap', 'reality'].map(r =>
        `<i style="background:${RINGS[r]}; box-shadow:0 0 90px 34px ${RINGS[r]}30, 0 0 22px 3px ${RINGS[r]}80;"></i>`
    ).join('<b></b>');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { width:1200px; height:630px; background:#080816; overflow:hidden;
               font-family:'SF Mono','Menlo','Consolas',monospace; position:relative; }
        canvas { position:absolute; inset:0; }
        .card { position:absolute; inset:0; display:flex; flex-direction:column;
                align-items:center; justify-content:center; text-align:center; }
        .dots { display:flex; align-items:center; margin-bottom:64px; }
        .dots i { width:34px; height:34px; border-radius:50%; display:block; }
        .dots b { width:72px; height:1px; background:rgba(255,255,255,0.10); display:block; }
        h1 { font-weight:200; font-size:50px; letter-spacing:0.86em; margin-right:-0.86em;
             color:#cccccc; white-space:nowrap; }
        p { margin-top:30px; font-size:23px; font-style:italic; letter-spacing:0.04em; color:#6a6a78; }
        .kernel { margin-top:44px; font-size:20px; letter-spacing:0.08em; }
        .kernel span { margin:0 17px; }
    </style></head><body>
    <canvas id="sky" width="1200" height="630"></canvas>
    <div class="card">
        <div class="dots">${three}</div>
        <h1 id="t">SERVINGKAOS</h1>
        <p>see the shape of your thinking</p>
        <div class="kernel"><span style="color:#ffd700">*want*</span><span style="color:#4ecdc4">{is}</span><span style="color:#5b8def">[gap]</span></div>
    </div>
    <script>{
        let seed = [...'servingkaos'].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 0x9e3779b9);
        const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        const ctx = document.getElementById('sky').getContext('2d');
        for (let i = 0; i < 260; i++) {
            ctx.beginPath();
            ctx.arc(rnd() * 1200, rnd() * 630, rnd() * 1.3 + 0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(200,210,255,' + (rnd() * 0.32 + 0.05) + ')';
            ctx.fill();
        }
    }</script></body></html>`;
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ executablePath: findChrome() });
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    // A card whose script threw still screenshots fine — just wrong. Be loud.
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
        for (const [file, ring] of Object.entries(PAGES)) {
            const html = fs.readFileSync(path.join(SITE, file), 'utf8');
            const title = meta(html, 'title'), desc = meta(html, 'description');
            if (!title || !desc) { console.error(`${file}: no og:title/og:description to print`); process.exit(1); }
            const slug = file.replace(/\.html$/, '');
            await page.setContent(card(slug, title, desc, ring));
            const fits = await page.$eval('#t', t => t.scrollWidth <= 1040);
            if (errors.length || !fits) {
                console.error(`${file}: card is wrong — ${errors.join(' | ') || 'title overflows'}`);
                process.exit(1);
            }
            await page.screenshot({ path: path.join(OUT, `${slug}.png`) });
            console.log(`  og/${slug}.png — ${title}`);
        }
        await page.setContent(siteCard());
        const siteFits = await page.$eval('#t', t => t.scrollWidth <= 1100);
        if (errors.length || !siteFits) {
            console.error(`og-card.png: card is wrong — ${errors.join(' | ') || 'title overflows'}`);
            process.exit(1);
        }
        await page.screenshot({ path: path.join(SITE, 'og-card.png') });
        console.log('  og-card.png — the front door');
    } finally {
        await browser.close();
    }
    console.log(`\n${Object.keys(PAGES).length} cards and the front door. point each page's og:image at its own.`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
