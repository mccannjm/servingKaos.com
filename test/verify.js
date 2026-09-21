#!/usr/bin/env node
// test/verify.js — the gate. Run `npm test` before merging to main;
// main auto-deploys, so this is the last stop.
//
// What it checks:
//   1. every internal link (href and src) resolves to a real file, with the
//      exact case Pages will demand; every page is reachable from the
//      forest; share tags are complete; no duplicate ids, no torn tags;
//      a miss gets 404.html and a malformed URL doesn't drop the server
//   2. every page loads over http with zero console errors
//   3. the Ariadne kernel: classification, zeusc scores, the molt seed,
//      the seed round-trip, the one-surface editor (transparent-ink
//      textarea over the mirror), zim⁰ suggestions, the sigils, and seed
//      links — a seed in the URL fragment wakes, a hostile one stays text
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
    const source = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(SITE, f), 'utf8')]));

    // href AND src — a missing image is as dead as a missing page. Pages is
    // case-sensitive and macOS isn't, so match the directory listing exactly
    // rather than trusting existsSync to be strict.
    const onDisk = new Set(fs.readdirSync(SITE));
    const localTarget = h => {
        const p = h.split('#')[0].split('?')[0].replace(/^\//, '');
        return p === '' ? 'index.html' : p;
    };
    let dead = [];
    const linksOf = {};
    for (const f of files) {
        linksOf[f] = [];
        for (const [, , h] of source[f].matchAll(/\b(href|src)="([^"]+)"/g)) {
            if (/^(https?:|#|mailto:|data:)/.test(h)) continue;
            const target = localTarget(h);
            linksOf[f].push(target);
            if (!onDisk.has(target)) dead.push(`${f} -> ${h}`);
        }
    }
    check(dead.length === 0, `internal links resolve, case and all (${files.length} pages)`, dead.join(', '));

    // Our own domain, spelled out in full (og:image, og:url, canonical), slips
    // past the check above as "external". It isn't — it's this folder.
    const HOME = 'https://servingkaos.com/';
    const deadHome = [];
    for (const f of files) {
        for (const [, u] of source[f].matchAll(/(?:href|src|content)="(https:\/\/servingkaos\.com\/[^"]*)"/g)) {
            const parts = localTarget(u.slice(HOME.length - 1)).split('/');
            if (!fs.existsSync(path.join(SITE, ...parts))
                || !fs.readdirSync(path.join(SITE, ...parts.slice(0, -1))).includes(parts.at(-1))) {
                deadHome.push(`${f} -> ${u}`);
            }
        }
    }
    check(deadHome.length === 0, 'every servingkaos.com address we print is a real file', deadHome.join(', '));
    const selfCanon = files.filter(f => f !== '404.html'
        && !source[f].includes(`rel="canonical" href="${HOME}${f === 'index.html' ? '' : f}"`));
    check(selfCanon.length === 0, 'each canonical points at its own page', selfCanon.join(', '));

    // Orphans: a page nothing links to is broken from the other side.
    // Walk out from the hub; 404.html is reached by missing, not by linking.
    const seen = new Set(['index.html']);
    const queue = ['index.html'];
    while (queue.length) {
        for (const t of linksOf[queue.shift()] || []) {
            if (t.endsWith('.html') && !seen.has(t)) { seen.add(t); queue.push(t); }
        }
    }
    const orphans = files.filter(f => !seen.has(f) && f !== '404.html');
    check(orphans.length === 0, 'every page is reachable from the forest', orphans.join(', '));

    const lacks = needle => files.filter(f => !source[f].includes(needle));
    const noOg = lacks('og:image');
    check(noOg.length === 0, 'every page carries the share card (og:image)', noOg.join(', '));
    const noWords = files.filter(f => !source[f].includes('og:title') || !source[f].includes('og:description'));
    check(noWords.length === 0, 'every share card has its words (og:title + og:description)', noWords.join(', '));
    check(fs.existsSync(path.join(SITE, 'og-card.png')), 'og-card.png exists');

    // Markup hygiene — both of these shipped once.
    const dupIds = [], leaked = [];
    for (const f of files) {
        const counts = {};
        for (const [, id] of source[f].matchAll(/\sid="([^"]+)"/g)) counts[id] = (counts[id] || 0) + 1;
        const dups = Object.keys(counts).filter(id => counts[id] > 1);
        if (dups.length) dupIds.push(`${f}: ${dups.join(' ')}`);
        // An attribute sitting in text content means an edit tore a tag in half.
        // Scripts and styles are stripped first — JS builds markup in strings.
        const body = source[f].replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
        for (const m of body.matchAll(/>[^<]*\b(?:style|class|href)="[^<]*</g)) {
            leaked.push(`${f}: ${m[0].slice(1, 50).trim()}…`);
        }
    }
    // {{ }} is this site's notation — and Liquid's. See .nojekyll for the rest.
    check(fs.existsSync(path.join(SITE, '.nojekyll')), 'Pages is told not to run Jekyll over the {{ brackets }}');
    const fronted = files.filter(f => source[f].startsWith('---'));
    check(fronted.length === 0, 'no page opens with front matter', fronted.join(', '));
    check(dupIds.length === 0, 'no duplicate ids', dupIds.join(' | '));
    check(leaked.length === 0, 'no torn tags leaking attributes into the text', leaked.join(' | '));

    // ── serve the site like Pages does ──
    const server = spawn(process.execPath, [path.join(SITE, 'serve.js'), String(PORT)], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 400));
    const base = `http://localhost:${PORT}`;

    // ── 1b. A miss lands somewhere — the way Pages answers it ──
    console.log('the miss:');
    const miss = await fetch(`${base}/ubuntutrees.html`);
    const missBody = await miss.text();
    check(miss.status === 404 && missBody.includes('the forest is at /'),
        'a missing page gets 404.html and a 404 status', `status ${miss.status}`);
    const torn = await fetch(`${base}/%E0%A4`).then(r => r.status).catch(e => e.message);
    const alive = await fetch(`${base}/index.html`).then(r => r.status).catch(e => e.message);
    check(torn === 404 && alive === 200,
        'a malformed URL is a miss, not a crash — the server is still up', `miss ${torn}, then ${alive}`);

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
        const defaultBlue = [];
        for (const f of files) {
            pageErrors.length = 0;
            await page.goto(`${base}/${f}`);
            await page.waitForTimeout(500);
            check(pageErrors.length === 0, f, pageErrors.join(' | '));
            // Text inside a link with no colour of its own inherits the
            // browser's #0000EE — invisible navy on this sky, purple once
            // visited. The hub's ring labels shipped that way for months.
            const stray = await page.evaluate(() => [...document.querySelectorAll('a, a *')]
                .filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
                .filter(el => ['rgb(0, 0, 238)', 'rgb(85, 26, 139)'].includes(getComputedStyle(el).color))
                .map(el => el.textContent.trim().slice(0, 24)));
            if (stray.length) defaultBlue.push(`${f}: ${stray.join(', ')}`);
        }
        check(defaultBlue.length === 0, 'no link text left in browser-default blue', defaultBlue.join(' | '));

        // ── 2b. Mobile sweep: every page at phone width, no errors,
        //        and the body never scrolls sideways ──
        console.log('mobile (390×844):');
        const mobilePage = await context.newPage();
        watch(mobilePage);
        await mobilePage.setViewportSize({ width: 390, height: 844 });
        for (const f of files) {
            pageErrors.length = 0;
            await mobilePage.goto(`${base}/${f}`);
            await mobilePage.waitForTimeout(400);
            const overflow = await mobilePage.evaluate(() =>
                document.documentElement.scrollWidth - document.documentElement.clientWidth);
            const okErr = pageErrors.length === 0;
            check(okErr && overflow <= 1, f, okErr ? `${overflow}px sideways overflow` : pageErrors.join(' | '));
        }
        await mobilePage.close();

        // ── 2b′. No script: the decks reveal slides with JS, so without it
        //        they were a black screen. The words must not wait for a script ──
        console.log('no script:');
        const bareContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
        const barePage = await bareContext.newPage();
        const dark = [];
        for (const f of files.filter(f => source[f].includes('class="slide'))) {
            await barePage.goto(`${base}/${f}`);
            const unseen = await barePage.evaluate(() => [...document.querySelectorAll('.slide')]
                .filter(s => getComputedStyle(s).opacity !== '1').length);
            if (unseen) dark.push(`${f}: ${unseen} slides hidden`);
        }
        check(dark.length === 0, 'every deck shows its words with JavaScript off', dark.join(' | '));
        await bareContext.close();

        // ── 2c. Reduced motion: pages must still arrive at their
        //        visible end-state with animation neutralized ──
        console.log('reduced motion:');
        const rmContext = await browser.newContext({
            viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
        const rmPage = await rmContext.newPage();
        watch(rmPage);
        pageErrors.length = 0;
        await rmPage.goto(`${base}/index.html`);
        await rmPage.waitForTimeout(500);
        const titleOpacity = await rmPage.$eval('.title', el => getComputedStyle(el).opacity);
        check(titleOpacity === '1', 'index title reaches full opacity without the fade', titleOpacity);
        await rmPage.goto(`${base}/honeytree.html`);
        await rmPage.waitForTimeout(500);
        await rmPage.evaluate(() => document.querySelectorAll('.slide')[12]?.scrollIntoView());
        await rmPage.waitForTimeout(400);
        const butterflyOpacity = await rmPage.$eval('.butterfly', el => getComputedStyle(el).opacity);
        check(butterflyOpacity === '1', 'the butterfly emerges without the animation', butterflyOpacity);
        check(pageErrors.length === 0, 'no errors under reduced motion', pageErrors.join(' | '));
        await rmContext.close();

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

        // ── 3b. One surface, zim⁰, sigils ──
        console.log('editor surface:');
        pageErrors.length = 0;
        await page.goto(`${base}/ariadne.html`);
        await page.waitForTimeout(700);

        const taColor = await page.$eval('#input', el => getComputedStyle(el).color);
        check(taColor === 'rgba(0, 0, 0, 0)', 'textarea ink is transparent — the mirror is the text', taColor);
        const drift = await page.evaluate(() => {
            const a = document.getElementById('input').getBoundingClientRect();
            const b = document.getElementById('mirror').getBoundingClientRect();
            return Math.abs(a.top - b.top) + Math.abs(a.left - b.left)
                 + Math.abs(a.width - b.width) + Math.abs(a.height - b.height);
        });
        check(drift < 1, 'mirror and textarea share exact geometry', `${drift}px drift`);

        console.log('zim⁰:');
        const barIdle = await page.$eval('#suggestBar', el => getComputedStyle(el).display);
        check(barIdle === 'none', 'suggestion bar stays hidden with nothing to say', barIdle);
        await page.fill('#input', 'I want to ship this tonight');
        await page.waitForTimeout(400);
        const patternChip = await page.locator('.suggest-chip').first().textContent().catch(() => '(no chip)');
        check(patternChip.includes('*'), 'pattern chip offers the intent wrap', patternChip);
        await page.focus('#input');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(300);
        const wrapped = await page.$eval('#input', el => el.value);
        check(wrapped === '*I want to ship this tonight*', 'Tab wraps the sentence', wrapped);

        await page.fill('#input', '{half a thought');
        await page.waitForTimeout(400);
        const closeChip = await page.locator('.suggest-chip').first().textContent().catch(() => '(no chip)');
        check(closeChip.includes('close'), 'unclosed bracket offers its other half', closeChip);
        await page.focus('#input');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(300);
        const closed = await page.$eval('#input', el => el.value);
        check(closed === '{half a thought}', 'Tab closes the thread', closed);

        console.log('sigils:');
        await page.fill('#input', 'vvARIADNEvv *the seed knows its year*');
        await page.waitForTimeout(400);
        await page.click('#moltBtn');
        const sigilSeed = await page.locator('#moltText').textContent();
        check(/(wood|fire|earth|metal|water) (rat|ox|tiger|rabbit|dragon|snake|horse|goat|monkey|rooster|dog|pig) year/.test(sigilSeed),
            'molt seed knows its zodiac year', sigilSeed.split('\n')[0]);
        check(sigilSeed.includes('beacon') && sigilSeed.includes('.-'), 'pins ride the morse beacon');
        await page.click('#moltClose');
        check(pageErrors.length === 0, 'no page errors through editor/zim⁰/sigils', pageErrors.join(' | '));

        // ── 3b′. Seed links: a seed can arrive in the URL fragment ──
        console.log('seed links:');
        pageErrors.length = 0;
        const LINKED = '*ship it* {it is late}\n[what did we forget?]';
        await page.goto(`${base}/index.html`); // leave first: a hash-only change doesn't reboot the page
        await page.goto(`${base}/ariadne.html#seed=${encodeURIComponent(LINKED)}`);
        await page.waitForTimeout(700);
        check(await page.$eval('#input', el => el.value) === LINKED, 'a linked seed lands in the editor, newlines and all');
        const linkedRings = await page.evaluate(() => [...new Set(currentNodes.map(n => n.ring))].sort().join(','));
        check(linkedRings === 'gap,intent,reality', 'and wakes as a constellation', linkedRings);
        const arrived = await page.evaluate(() => currentNodes.length > 0 && currentNodes.every(n => novaExternalIDs.has(n.id)));
        check(arrived, 'Nova greets linked nodes as arrivals — external, like a paste');

        // The one place a stranger's URL feeds the page. It must stay text.
        const HOSTILE = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</' + 'script>{{still a seed}}';
        await page.goto(`${base}/index.html`);
        await page.goto(`${base}/ariadne.html#seed=${encodeURIComponent(HOSTILE)}`);
        await page.waitForTimeout(700);
        const inert = await page.evaluate(() => ({
            pwned: window.__pwned, imgs: document.querySelectorAll('#mirror img, #mirror script').length,
            kept: document.getElementById('input').value.includes('onerror') }));
        check(inert.pwned === undefined && inert.imgs === 0 && inert.kept,
            'a hostile seed is just text — nothing runs, nothing is built', JSON.stringify(inert));

        await page.goto(`${base}/index.html`);
        await page.goto(`${base}/ariadne.html#seed=%E0%A4`);
        await page.waitForTimeout(700);
        const fellBack = (await page.locator('#temperWord').textContent()).trim();
        check(fellBack === 'frolic', 'a torn seed is ignored — the default wakes instead', fellBack);

        // Molt → link → a fresh Ariadne: the round trip, by URL this time.
        await page.goto(`${base}/ariadne.html`);
        await page.waitForTimeout(700);
        await page.click('#moltBtn');
        await page.click('#moltLink');
        const moltLink = await page.$eval('#moltLink', el => el.dataset.link || '');
        await page.click('#moltClose');
        await page.goto(`${base}/index.html`);
        await page.goto(moltLink);
        await page.waitForTimeout(700);
        const linkPills = await page.locator('#ringPills .ring-pill').count();
        check(moltLink.includes('#seed=') && linkPills === 6, 'molt → copy link → open it: all six rings return', `${linkPills} rings`);

        // The thesis page opens itself in the instrument.
        await page.goto(`${base}/rings.html`);
        await page.waitForTimeout(400);
        await page.evaluate(() => document.querySelector('a[href^="ariadne.html#seed="]').click());
        await page.waitForTimeout(900);
        const thesis = await page.$eval('#input', el => el.value);
        const verdict = (await page.locator('#temperWord').textContent()).trim();
        const errorsInThesis = await page.locator('.sev-error, .sev-warning').count();
        check(thesis.includes('{{All men are created equal}}') && thesis.includes("shapes don't"),
            'rings.html hands the instrument its own argument');
        check(verdict === 'clarity' && errorsInThesis === 0, 'and the thesis type-checks: clarity, zeusc clean', `${verdict}, ${errorsInThesis} problems`);
        check(pageErrors.length === 0, 'no page errors through the seed-link suite', pageErrors.join(' | '));

        // ── 3c. The garage and the volume ──
        console.log('the garage:');
        await page.goto(`${base}/dale.html`);
        await page.waitForTimeout(500);
        const wall = await page.locator('.num-card').count();
        check(wall === 13, 'the wall holds thirteen plaques', `${wall} cards`);
        const garageText = await page.locator('body').textContent();
        check(garageText.includes('Davey Allison') && garageText.includes('PINS NEVER DECAY'),
            'the garage remembers, and the pin rule is named');
        check(!fs.readFileSync(path.join(SITE, 'ariadne.html'), 'utf8').includes('NASCAR_LEGENDS'),
            'the numbers left the instrument — no legends table in ariadne');
        const volumeText = fs.readFileSync(path.join(SITE, 'volume.html'), 'utf8');
        check(volumeText.includes('FEUER FREI') && volumeText.includes('BOYBAND WAR') && volumeText.includes('SILO'),
            'the comparisons survived the move to maximum volume');

        // ── 3d. The decks answer the keyboard ──
        console.log('keys:');
        const decks = files.filter(f => source[f].includes('class="slide'));
        const deaf = decks.filter(f => !source[f].includes('keys: the deck answers the keyboard'));
        check(deaf.length === 0, `all ${decks.length} decks carry the key handler`, deaf.join(', '));

        const slideAt = p => p.evaluate(() => {
            const deck = [...document.querySelectorAll('.slide')], mid = innerHeight / 2;
            let at = 0, best = Infinity;
            deck.forEach((s, i) => {
                const r = s.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - mid);
                if (d < best) { best = d; at = i; }
            });
            return at;
        });
        pageErrors.length = 0;
        await page.goto(`${base}/kansas.html`);
        await page.waitForTimeout(500);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(900);
        const afterDown = await slideAt(page);
        await page.keyboard.press('j');
        await page.waitForTimeout(900);
        const afterJ = await slideAt(page);
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(900);
        const afterUp = await slideAt(page);
        check(afterDown === 1 && afterJ === 2 && afterUp === 1,
            '↓ and j step forward a slide, ↑ steps back', `${afterDown}, ${afterJ}, ${afterUp}`);
        await page.keyboard.press('End');
        await page.waitForTimeout(1200);
        const lastSlide = await page.locator('.slide').count() - 1;
        check(await slideAt(page) === lastSlide, 'End lands on the closing slide', String(await slideAt(page)));

        // The rule that matters: on a screen shorter than the slide, a key
        // must scroll, not jump — nothing below the fold gets skipped.
        const shortPage = await context.newPage();
        watch(shortPage);
        await shortPage.setViewportSize({ width: 390, height: 420 });
        await shortPage.goto(`${base}/kansas.html`);
        await shortPage.waitForTimeout(500);
        const tall = await shortPage.evaluate(() => {
            const i = [...document.querySelectorAll('.slide')]
                .findIndex(s => s.getBoundingClientRect().height > innerHeight + 200);
            if (i >= 0) document.querySelectorAll('.slide')[i].scrollIntoView({ block: 'start' });
            return i;
        });
        await shortPage.waitForTimeout(300);
        const yBefore = await shortPage.evaluate(() => scrollY);
        await shortPage.keyboard.press('ArrowDown');
        await shortPage.waitForTimeout(700);
        const moved = await shortPage.evaluate(() => scrollY) - yBefore;
        check(tall >= 0 && moved > 0 && moved < 200 && await slideAt(shortPage) === tall,
            'a slide taller than the screen scrolls instead of jumping — nothing skipped',
            `slide ${tall}, moved ${moved}px, now on ${await slideAt(shortPage)}`);
        await shortPage.close();
        check(pageErrors.length === 0, 'no page errors through the keys suite', pageErrors.join(' | '));

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
