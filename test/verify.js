#!/usr/bin/env node
// test/verify.js — the gate. Run `npm test` before merging to main;
// main auto-deploys, so this is the last stop.
//
// What it checks:
//   1. every internal link on every page resolves to a real file
//   2. every page loads over http with zero console errors
//   3. the Ariadne kernel: classification, zeusc scores, the molt seed,
//      and the seed round-trip (paste a seed back in, the rings return)
//   4. the Nova door: wake-fold, convergence starburst, settle, paste→fold,
//      the paste-surge tornado, its decay back through fold, and the
//      two-tab fellowship tornado
//
// Uses your installed Chrome/Chromium via playwright-core (the repo's only
// dev dependency — no browser download). Set CHROME_PATH if yours hides
// somewhere unusual.

const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const PORT = 8734; // unlikely to collide; the server is ours for the run

let failures = 0;
function ok(label) { console.log(`  ok   ${label}`); }
function fail(label, detail) {
    failures++;
    console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
}
function check(cond, label, detail) { cond ? ok(label) : fail(label, detail); }

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        // macOS
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        // Linux
        '/opt/pw-browsers/chromium',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
    ].filter(Boolean);
    for (const c of candidates) if (fs.existsSync(c)) return c;
    console.error('No Chrome/Chromium found. Set CHROME_PATH=/path/to/chrome and rerun.');
    process.exit(2);
}

async function main() {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── 1. Static link check (no browser needed) ──
    console.log('links:');
    const files = fs.readdirSync(SITE).filter(f => f.endsWith('.html'));
    let dead = [];
    for (const f of files) {
        const html = fs.readFileSync(path.join(SITE, f), 'utf8');
        for (const [, h] of html.matchAll(/href="([^"]+)"/g)) {
            if (/^(https?:|#|mailto:)/.test(h)) continue;
            if (!fs.existsSync(path.join(SITE, h.split('#')[0]))) dead.push(`${f} -> ${h}`);
        }
    }
    check(dead.length === 0, `internal links resolve (${files.length} pages)`, dead.join(', '));

    // ── serve the site like Pages does ──
    const server = spawn(process.execPath, [path.join(SITE, 'serve.js'), String(PORT)], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 400));
    const base = `http://localhost:${PORT}`;

    const browser = await chromium.launch({ executablePath: findChrome() });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    const pageErrors = [];
    function watch(p) {
        p.on('console', m => { if (m.type() === 'error') pageErrors.push(`[console] ${m.text()}`); });
        p.on('pageerror', e => pageErrors.push(`[pageerror] ${e.message}`));
    }

    try {
        const page = await context.newPage();
        watch(page);

        // ── 2. Every page loads clean ──
        console.log('pages:');
        for (const f of files) {
            pageErrors.length = 0;
            await page.goto(`${base}/${f}`);
            await page.waitForTimeout(500);
            check(pageErrors.length === 0, f, pageErrors.join(' | '));
        }

        // ── 3. Ariadne kernel ──
        console.log('ariadne kernel:');
        pageErrors.length = 0;
        await page.goto(`${base}/ariadne.html`);
        await page.waitForTimeout(700);

        const pills = await page.locator('#ringPills .ring-pill').allTextContents();
        check(pills.length === 6, 'seed text lights all six rings', `got ${pills.length}: ${pills.join(', ')}`);

        const temper = (await page.locator('#temperWord').textContent()).trim();
        const conv = (await page.locator('#convPct').textContent()).trim();
        check(temper === 'frolic' && conv === '81%',
            'zeusc scores the seed frolic 81% (hand-checked against the Swift math)',
            `got ${temper} ${conv}`);

        await page.fill('#input', '[one] [two] [three] [four] [five] [six] [seven]');
        await page.waitForTimeout(400);
        const zeusc = (await page.locator('#zeuscSummary').textContent()).trim();
        const temperFlood = (await page.locator('#temperWord').textContent()).trim();
        check(zeusc.includes('error') && temperFlood === 'friction',
            'gap flood raises the memory-leak error, temper friction', `got "${zeusc}" ${temperFlood}`);

        const SEED_TEXT = '*resurrect the instrument* {it was buried in the git log for five months}\n{{what else is down there?}} [does the seed survive the paste?]\n^watch me watching the rings^\n:the thread was never cut:\nvvARIADNEvv';
        await page.fill('#input', SEED_TEXT);
        await page.waitForTimeout(400);
        await page.click('#moltBtn');
        const seed = await page.locator('#moltText').textContent();
        check(seed.includes('vvARIADNEvv') && seed.includes('{it was buried in the git log for five months}')
            && seed.includes('{{what else is down there?}}') && seed.includes('[does the seed survive the paste?]'),
            'molt seed carries pins, reality, question, and gap nodes', seed.replace(/\n/g, ' ⏎ '));
        await page.click('#moltClose');

        await page.fill('#input', seed);
        await page.waitForTimeout(400);
        const rtPills = await page.locator('#ringPills .ring-pill').allTextContents();
        check(rtPills.length === 6, 'the seed survives the paste — all six rings return', rtPills.join(', '));
        check(pageErrors.length === 0, 'no page errors through the kernel suite', pageErrors.join(' | '));

        // ── 4. Nova door ──
        console.log('nova door:');
        pageErrors.length = 0;
        await page.goto(`${base}/ariadne.html`);
        await page.waitForTimeout(700);
        await page.click('.door-btn[data-door="nova"]');

        // Entry with a populated constellation: wake → fold, and the seed
        // text converges clean, so the machine takes the starburst from fold.
        await page.waitForTimeout(300);
        const entryState = (await page.locator('#novaState').textContent()).trim();
        check(entryState.startsWith('nova:'), 'state readout live on door entry', entryState);

        const sawBurst = await page.waitForFunction(
            () => document.getElementById('novaState').textContent.includes('nova: nova'),
            null, { timeout: 3000 }).then(() => true).catch(() => false);
        check(sawBurst, 'seed converges → starburst on entry');

        const settled = await page.waitForFunction(
            () => document.getElementById('novaState').textContent.includes('nova: tilt'),
            null, { timeout: 4000 }).then(() => true).catch(() => false);
        check(settled, 'starburst runs its 2s, settles to tilt');

        // Divergent text re-arms the latch but stays tilt (no external data).
        await page.fill('#input', '[a] [b] [c] [d] [e]');
        await page.waitForTimeout(500);
        const tiltHeld = (await page.locator('#novaState').textContent()).includes('tilt');
        check(tiltHeld, 'divergent typing holds tilt', await page.locator('#novaState').textContent());

        // A paste is external data arriving: tilt → fold.
        await page.evaluate(() => {
            document.getElementById('input').dispatchEvent(new ClipboardEvent('paste', { bubbles: true }));
        });
        const folded = await page.waitForFunction(
            () => document.getElementById('novaState').textContent.includes('nova: fold'),
            null, { timeout: 2000 }).then(() => true).catch(() => false);
        check(folded, 'paste (external data) folds the atom');

        // Balance the rings clean → convergence fires from fold → starburst.
        await page.fill('#input', '*what I want* {what is}');
        const reBurst = await page.waitForFunction(
            () => document.getElementById('novaState').textContent.includes('nova: nova'),
            null, { timeout: 3000 }).then(() => true).catch(() => false);
        check(reBurst, 'intent meets reality → the funnels touch → starburst');
        await page.waitForTimeout(1100); // into the burst phase — the spray is out
        await page.screenshot({ path: path.join(SHOTS, 'nova-burst.png') });
        await page.waitForFunction(
            () => document.getElementById('novaState').textContent.includes('nova: tilt'),
            null, { timeout: 4000 }).catch(() => {});

        // Signal surge: three pastes inside 5s → tornado. Single tab,
        // works from file:// too — no fellowship required.
        await page.fill('#input', '[loose thread] [another one]');
        await page.waitForTimeout(300);
        await page.evaluate(() => {
            const i = document.getElementById('input');
            for (let k = 0; k < 3; k++) i.dispatchEvent(new ClipboardEvent('paste', { bubbles: true }));
        });
        const surge = await page.waitForFunction(
            () => document.getElementById('novaState').textContent.includes('nova: tornado'),
            null, { timeout: 3000 }).then(() => true).catch(() => false);
        check(surge, 'paste ×3 in 5s = signal surge → tornado, single tab');
        await page.waitForTimeout(1300); // the funnels ramp in over 1.2s
        await page.screenshot({ path: path.join(SHOTS, 'nova-tornado.png') });

        // Decay: the pastes age out of the 5s window → tornado unwinds to fold.
        const decayed = await page.waitForFunction(
            () => document.getElementById('novaState').textContent.includes('nova: fold'),
            null, { timeout: 7000 }).then(() => true).catch(() => false);
        check(decayed, 'surge expires → tornado decays through fold');

        // Fellowship: a second tab alone spins it back up — no paste needed.
        const page2 = await context.newPage();
        watch(page2);
        await page2.goto(`${base}/ariadne.html`);
        const tornado2 = await page.waitForFunction(
            () => document.getElementById('novaState').textContent.includes('nova: tornado'),
            null, { timeout: 6000 }).then(() => true).catch(() => false);
        check(tornado2, 'second tab = fellowship of 2 → tornado returns');
        await page2.close();

        check(pageErrors.length === 0, 'no page errors through the nova suite', pageErrors.join(' | '));

        // Screenshots for the eyeball pass
        await page.goto(`${base}/ariadne.html`);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(SHOTS, 'ariadne.png') });
        await page.goto(`${base}/proofs.html`);
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(SHOTS, 'proofs.png') });
    } finally {
        await browser.close();
        server.kill();
    }

    console.log('');
    if (failures) {
        console.log(`${failures} failure${failures > 1 ? 's' : ''}. Not clean — don't merge.`);
        process.exit(1);
    }
    console.log('clean. screenshots in test/shots/. merge when ready.');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
