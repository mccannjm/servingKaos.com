# servingkaos.com

Personal website hosted via GitHub Pages at [servingkaos.com](https://servingkaos.com)

## Local Development

Static site, zero build step. Any page opens straight from disk:

```bash
open index.html
```

To serve it the way GitHub Pages does (needed for the Ariadne fellowship
signal — two tabs finding each other requires a real origin, and `file://`
isn't one):

```bash
npm run serve        # http://localhost:8080 — zero dependencies, plain node
```

## Testing — run this before merging

Pushes to `main` deploy automatically, so the test gate is the last stop:

```bash
npm install          # once — playwright-core, the repo's only dependency
npm test
```

The gate checks:

- every internal link resolves — `href` and `src`, and every full
  `https://servingkaos.com/...` address in the share tags — with the **exact
  case** Pages demands (macOS will happily open `Dale.png` for `dale.png`;
  Pages won't, and that's how a link works here and breaks there)
- every page is reachable from the forest — no orphans
- every page has its full share card: `og:image`, `og:title`,
  `og:description`, and a canonical that points at itself
- no duplicate ids, no torn tags leaking attributes into the visible text
- a miss gets `404.html` with a 404 status, and a malformed URL doesn't
  take the server down

Then, in a real browser:

- every page loads with zero console errors, at desktop and at 390px with
  no sideways scroll, and still arrives under reduced motion
- the Ariadne kernel: classification, zeusc scores (hand-checked against
  the Swift math), the molt seed, and the seed round-trip
- the Nova door: wake-fold, the convergence starburst, settle, paste→fold,
  the paste-surge tornado (×3 fast — works from file:// too), its decay
  back through fold, and the two-tab fellowship tornado

It drives your installed Chrome/Chromium/Edge — no browser download. If
yours isn't found automatically, point at it: `CHROME_PATH=/path/to/chrome npm test`.
Screenshots land in `test/shots/` for the eyeball pass.

## Share cards

Every page unfurls as itself. `og/<page>.png` is printed from that page's own
`og:title` and `og:description`, so a card can't drift from its page:

```bash
npm run cards        # rewrites og/*.png — byte-identical unless the words changed
```

Six dots ride the top of each card, one per ring; a page lights its own
(`tools/og-cards.js` holds the map). Kansas lights none. `index.html` and
`404.html` keep the site-wide `og-card.png`. Adding a page means adding it to
that map, running the command, and pointing the page's `og:image` at the png —
the gate will tell you if the address is wrong.

## Deployment

The site automatically deploys when changes are pushed to the main branch.
