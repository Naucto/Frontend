/**
 * Reports which glyphs the design draws that the app's icon set does not contain, and where each
 * one sits, so a wrong or missing icon can be found without opening both side by side.
 *
 * Screenshot diffing cannot do this job: the design and the app hold different content, so a pixel
 * diff of two screens is almost entirely noise. An icon is not content though — it is a glyph with
 * an identity, and both sides draw it as an SVG path on the same 24-grid. So this compares the
 * glyphs themselves.
 *
 * Path strings cannot be compared directly: the design and pixelarticons write the same rectangles
 * in a different order, so string equality reports 107 of 108 icons as different when almost none
 * of them are. Rasterising each path to a 24x24 bitmask is exact and immune to how the path was
 * written.
 *
 * Correspondence comes from the foundations artboard, which is an icon gallery that prints each
 * glyph's name beneath it. That gives an exact design-name → glyph map to diff against the app's
 * own name → glyph map, with no guessing. Nearest-neighbour matching is not a substitute: a glyph
 * the design never draws still has *some* nearest neighbour, and the distance says nothing about
 * whether they are the same icon.
 *
 * The gallery is a library sheet, not a record of use, so the two can disagree — see EXCEPTIONS.
 *
 * Glyphs drawn elsewhere but absent from the gallery are still reported, with the artboard and the
 * text beside them, so a person can place them.
 *
 * Usage:  node tools/design-icons.mjs <url-of-served-design> [--json out.json]
 * The design must be served (the artboard DOM is minted at runtime), e.g.
 *   python3 -m http.server 8891 --directory <dir-containing-design.html>
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const GRID = 24;

/**
 * Names where the app deliberately draws something other than the gallery cell, so the report can
 * stay at zero disagreements and a real regression still shows up. Each one needs a reason that
 * outweighs the caption; "the design's own usage contradicts its gallery" is the only one so far.
 */
const EXCEPTIONS = new Map([
  [
    'notification',
    'the gallery draws an outline bell once; all 24 bells the design actually places, in the hub ' +
      'and editor headers alike, are the solid one the app now uses',
  ],
]);

function appIcons() {
  const src = readFileSync('packages/ui/src/icons/paths.ts', 'utf8');
  const out = new Map();
  for (const m of src.matchAll(/'?([a-zA-Z0-9-]+)'?:\s*\n?\s*'([^']+)'/g)) out.set(m[1], m[2]);
  return out;
}

/**
 * Not every glyph the app draws is an icon. The oscillator waves are strokes on their own 34x15
 * box, and the controller is sixteen pieces on a 96x56 one; both live with the component that
 * draws them rather than in ICON_PATHS. Without this the report lists all twelve as missing
 * forever -- and a list with permanent entries in it stops being read.
 *
 * Add a file here whenever a component starts drawing its own paths.
 */
const EXTRA_SOURCES = [
  'apps/web/src/app/features/editor/sound/wave-glyph.component.ts',
  'apps/web/src/app/features/settings/gamepad-art.component.ts',
];

function appExtras() {
  const out = new Map();
  for (const file of EXTRA_SOURCES) {
    const src = readFileSync(file, 'utf8');
    let n = 0;
    // A path reaches a template either as a value in a lookup object or as a literal d attribute.
    for (const m of src.matchAll(/(\w+):\s*'([^']+)'/g)) out.set(`${file}#${m[1]}`, m[2]);
    for (const m of src.matchAll(/\bd="([^"]+)"/g)) out.set(`${file}#${n++}`, m[1]);
  }
  return out;
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: node tools/design-icons.mjs <url-of-served-design> [--json out.json]');
    process.exit(2);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.dv-opt', { timeout: 30_000 });

  const rasterise = (paths) =>
    page.evaluate(
      ({ list, grid }) => {
        const c = new OffscreenCanvas(grid, grid);
        const x = c.getContext('2d');
        return list.map((d) => {
          x.clearRect(0, 0, grid, grid);
          x.fillStyle = '#000';
          try {
            x.fill(new Path2D(d));
          } catch {
            return null;
          }
          const px = x.getImageData(0, 0, grid, grid).data;
          let bits = '';
          for (let i = 0; i < grid * grid; i++) bits += px[i * 4 + 3] > 127 ? '1' : '0';
          return bits;
        });
      },
      { list: paths, grid: GRID },
    );

  const app = new Map([...appIcons(), ...appExtras()]);
  const appBits = await rasterise([...app.values()]);
  const appNames = [...app.keys()];
  const known = new Map();
  appBits.forEach((b, i) => {
    if (b && !known.has(b)) known.set(b, appNames[i]);
  });

  // Every glyph the artboards draw, with the artboard it is on, its rendered size and colour, and
  // the nearest text — which is what identifies the slot to a person reading the report.
  const drawn = await page.evaluate(() => {
    const rows = [];
    for (const board of document.querySelectorAll('.dv-opt')) {
      for (const svg of board.querySelectorAll('svg')) {
        const d = [...svg.querySelectorAll('path')]
          .map((p) => p.getAttribute('d') ?? '')
          .join(' ')
          .trim();
        if (!d) continue;
        let ctx = '';
        let p = svg.parentElement;
        for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
          const t = (p.innerText || '').replace(/\s+/g, ' ').trim();
          if (t) {
            ctx = t.slice(0, 44);
            break;
          }
        }
        rows.push({
          board: board.id,
          size: Math.round(svg.getBoundingClientRect().width),
          colour: getComputedStyle(svg).color,
          ctx,
          d,
        });
      }
    }
    return rows;
  });

  // The foundations artboard captions every glyph it shows, which is the one place the design
  // states an icon's *name*. That turns the comparison into a diff instead of a guess.
  const named = await page.evaluate(() => {
    const board = document.querySelector('.dv-opt#\\31 a') ?? document.getElementById('1a');
    if (!board) return [];
    const out = [];
    for (const svg of board.querySelectorAll('svg')) {
      const d = [...svg.querySelectorAll('path')]
        .map((p) => p.getAttribute('d') ?? '')
        .join(' ')
        .trim();
      if (!d) continue;
      let cell = svg.parentElement;
      for (let i = 0; i < 3 && cell; i++, cell = cell.parentElement) {
        const t = (cell.innerText || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 24) {
          out.push({ name: t, d });
          break;
        }
      }
    }
    return out;
  });

  const drawnBits = await rasterise(drawn.map((r) => r.d));
  const namedBits = await rasterise(named.map((r) => r.d));
  await browser.close();

  // Same name on both sides, different picture: the highest-confidence finding there is.
  const wrong = [];
  namedBits.forEach((bits, i) => {
    if (!bits) return;
    const name = named[i].name.toLowerCase();
    const appPath = app.get(name);
    if (!appPath) return;
    const appIdx = appNames.indexOf(name);
    const appBit = appBits[appIdx];
    if (!appBit || appBit === bits) return;
    let diff = 0;
    for (let k = 0; k < bits.length; k++) if (bits[k] !== appBit[k]) diff++;
    if (EXCEPTIONS.has(name)) return;
    if (!wrong.some((w) => w.name === name)) wrong.push({ name, diff });
  });

  const missing = new Map();
  let matched = 0;
  drawnBits.forEach((bits, i) => {
    if (!bits || !bits.includes('1')) return;
    if (known.has(bits)) {
      matched++;
      return;
    }
    const row = drawn[i];
    const seen = missing.get(row.d) ?? { ...row, count: 0, where: [] };
    seen.count++;
    if (seen.where.length < 4 && !seen.where.includes(`${row.board} ${row.ctx}`)) {
      seen.where.push(`${row.board} ${row.ctx}`);
    }
    missing.set(row.d, seen);
  });

  const list = [...missing.values()].sort((a, b) => b.count - a.count);
  console.log(`glyphs drawn by the design: ${drawnBits.filter(Boolean).length}`);
  console.log(`already in the app's icon set: ${matched}`);
  console.log(
    `\nWRONG PICTURE — the foundations artboard names these, and the app draws them differently (${wrong.length}):`,
  );
  for (const [name, why] of EXCEPTIONS) console.log(`  (${name} held back on purpose: ${why})`);
  for (const w of wrong.sort((a, b) => b.diff - a.diff)) {
    console.log(`  ${w.name.padEnd(18)} ${w.diff} of ${GRID * GRID} px differ`);
  }
  console.log(`\nNOT in the app's set (${list.length} distinct):`);
  for (const m of list) {
    console.log(`\n  ×${m.count}  ${m.size}px  ${m.colour}`);
    for (const w of m.where) console.log(`        ${w}`);
    console.log(`        d="${m.d.slice(0, 78)}${m.d.length > 78 ? '…' : ''}"`);
  }

  const jsonAt = process.argv.indexOf('--json');
  if (jsonAt > 0 && process.argv[jsonAt + 1]) {
    writeFileSync(process.argv[jsonAt + 1], JSON.stringify(list, null, 2));
    console.log(`\nwrote ${process.argv[jsonAt + 1]}`);
  }
}

await main();
