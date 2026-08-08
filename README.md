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

The gate checks, in a real browser:

- every internal link on every page resolves
- every page loads with zero console errors
- the Ariadne kernel: classification, zeusc scores (hand-checked against
  the Swift math), the molt seed, and the seed round-trip
- the Nova door: wake-fold, the convergence starburst, settle, paste→fold,
  and the two-tab fellowship→tornado

It drives your installed Chrome/Chromium/Edge — no browser download. If
yours isn't found automatically, point at it: `CHROME_PATH=/path/to/chrome npm test`.
Screenshots land in `test/shots/` for the eyeball pass.

## Deployment

The site automatically deploys when changes are pushed to the main branch.
