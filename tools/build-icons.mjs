// Generates packages/ui/src/icons/paths.ts from pixelarticons (MIT) for the icon subset in tools/icons.json.
// Run: node tools/build-icons.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const aliases = JSON.parse(await readFile(resolve(root, 'tools/icons.json'), 'utf8'));
const svgDir = dirname(require.resolve('pixelarticons/package.json')) + '/svg';

/**
 * Glyphs taken from the design rather than from pixelarticons, on the same 24-grid.
 *
 * Two reasons a name lands here. Either pixelarticons has no equivalent at all (`line`, `pip`), or
 * the artboards deliberately draw a different picture under a name pixelarticons also has — the
 * transport's play is a filled triangle in the design and a hollow outline in pixelarticons, and
 * they read as different controls at 12px. A name listed here wins over `icons.json`.
 *
 * These are lifted verbatim from the artboards, so re-running this script cannot drift them.
 */
const CUSTOM = {
  alert:
    'M13 1h-2v2H9v2H7v2H5v2H3v2H1v2h2v2h2v2h2v2h2v2h2v2h2v-2h2v-2h2v-2h2v-2h2v-2h2v-2h-2V9h-2V7h-2V5h-2V3h-2V1zm0 2v2h2v2h2v2h2v2h2v2h-2v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-2H3v-2h2V9h2V7h2V5h2V3h2zm0 4h-2v6h2V7zm0 8h-2v2h2v-2z',
  'arrow-left':
    'M20 11v2H8v2H6v-2H4v-2h2V9h2v2h12zM10 7H8v2h2V7zm0 0h2V5h-2v2zm0 10H8v-2h2v2zm0 0h2v2h-2v-2z',
  'arrow-right':
    'M4 11v2h12v2h2v-2h2v-2h-2V9h-2v2H4zm10-4h2v2h-2V7zm0 0h-2V5h2v2zm0 10h2v-2h-2v2zm0 0h-2v2h2v-2z',
  at: 'M4 4h16v12H8V8h8v6h2V6H6v12h14v2H4V4zm10 10v-4h-4v4h4z',
  'audio-device':
    'M4 4h4v2H4v8h4v2H2V4h2zm6 0h10v2h-8v12h8v2H10V4zm12 0h-2v16h2V4zm-7 4h2v2h-2V8zm3 4h-4v4h4v-4zM8 18H4v2h4v-2z',
  bug: 'M8 2h2v4h4V2h2v4h2v3h2v2h-2v2h4v2h-4v2h2v2h-2v3H6v-3H4v-2h2v-2H2v-2h4v-2H4V9h2V6h2V2Zm8 6H8v3h8V8Zm-5 5H8v7h3v-7Zm2 7h3v-7h-3v7ZM4 9H2V7h2v2Zm0 10v2H2v-2h2Zm16 0h2v2h-2v-2Zm0-10V7h2v2h-2Z',
  'chart-bar': 'M13 5h2v14h-2V5zm-2 4H9v10h2V9zm-4 4H5v6h2v-6zm12 0h-2v6h2v-6z',
  check:
    'M18 6h2v2h-2V6zm-2 4V8h2v2h-2zm-2 2v-2h2v2h-2zm-2 2h2v-2h-2v2zm-2 2h2v-2h-2v2zm-2 0v2h2v-2H8zm-2-2h2v2H6v-2zm0 0H4v-2h2v2z',
  'chevron-down': 'M7 8H5v2h2v2h2v2h2v2h2v-2h2v-2h2v-2h2V8h-2v2h-2v2h-2v2h-2v-2H9v-2H7V8z',
  'chevron-left':
    'M16 5v2h-2V5h2zm-4 4V7h2v2h-2zm-2 2V9h2v2h-2zm0 2H8v-2h2v2zm2 2v-2h-2v2h2zm0 0h2v2h-2v-2zm4 4v-2h-2v2h2z',
  'chevron-right':
    'M8 5v2h2V5H8zm4 4V7h-2v2h2zm2 2V9h-2v2h2zm0 2h2v-2h-2v2zm-2 2v-2h2v2h-2zm0 0h-2v2h2v-2zm-4 4v-2h2v2H8z',
  'chevron-up': 'M7 16H5v-2h2v-2h2v-2h2V8h2v2h2v2h2v2h2v2h-2v-2h-2v-2h-2v-2h-2v2H9v2H7v2z',
  clock: 'M19 3H5v2H3v14h2v2h14v-2h2V5h-2V3zm0 2v14H5V5h14zm-8 2h2v6h4v2h-6V7z',
  close:
    'M5 5h2v2H5V5zm4 4H7V7h2v2zm2 2H9V9h2v2zm2 0h-2v2H9v2H7v2H5v2h2v-2h2v-2h2v-2h2v2h2v2h2v2h2v-2h-2v-2h-2v-2h-2v-2zm2-2v2h-2V9h2zm2-2v2h-2V7h2zm0 0V5h2v2h-2z',
  'cloud-upload':
    'M10 4h6v2h-6V4zM8 8V6h2v2H8zm-4 2V8h4v2H4zm-2 2v-2h2v2H2zm0 6H0v-6h2v6zm0 0h7v2H2v-2zM18 8h-2V6h2v2zm4 4h-4V8h2v2h2v2zm0 6v-6h2v6h-2zm0 0v2h-7v-2h7zM11 9h2v2h2v2h2v2h-4v5h-2v-5H7v-2h2v-2h2V9z',
  code: 'M8 5h2v2H8V5zM6 7h2v2H6V7zM4 9h2v2H4V9zm-2 2h2v2H2v-2zm2 2h2v2H4v-2zm2 2h2v2H6v-2zm2 2h2v2H8v-2zm8-12h-2v2h2V5zm2 2h-2v2h2V7zm2 2h-2v2h2V9zm2 2h-2v2h2v-2zm-2 2h-2v2h2v-2zm-2 2h-2v2h2v-2zm-2 2h-2v2h2v-2z',
  collapse:
    'M17 3h-2v2h-2v2h-2V5H9V3H7v2h2v2h2v2h2V7h2V5h2V3zM4 13h16v-2H4v2zm9 4h-2v-2h2v2zm2 2h-2v-2h2v2zm0 0h2v2h-2v-2zm-6 0h2v-2H9v2zm0 0H7v2h2v-2z',
  debug: 'M6 2h2v2H6V2Zm4 9h4v2h-4v-2Zm4 4h-4v2h4v-2Z',
  'device-phone': 'M6 3h12v18H6V3zm10 16V5h-2v2h-4V5H8v14h8zm-5-4h2v2h-2v-2z',
  drop: 'M13 2h-2v2H9v4H7v4H5v6h2v2h2v2h6v-2h2v-2h2v-6h-2V8h-2V4h-2V2zm0 2v4h2v4h2v6h-2v2H9v-2H7v-6h2V8h2V4h2z',
  duplicate: 'M5 3h12v4h4v14H7v-4H3V3h2zm10 4V5H5v10h2V7h8zM9 17v2h10V9H9v8z',
  expand:
    'M11 5h2v2h2v2h2V7h-2V5h-2V3h-2v2zM9 7V5h2v2H9zm0 0v2H7V7h2zm-5 6h16v-2H4v2zm9 6h-2v-2H9v-2H7v2h2v2h2v2h2v-2zm2-2h-2v2h2v-2zm0 0h2v-2h-2v2z',
  'external-link':
    'M21 11V3h-8v2h4v2h-2v2h-2v2h-2v2H9v2h2v-2h2v-2h2V9h2V7h2v4h2zM11 5H3v16h16v-8h-2v6H5V7h6V5z',
  eye: 'M8 6h8v2H8V6zm-4 4V8h4v2H4zm-2 2v-2h2v2H2zm0 2v-2H0v2h2zm2 2H2v-2h2v2zm4 2H4v-2h4v2zm8 0v2H8v-2h8zm4-2v2h-4v-2h4zm2-2v2h-2v-2h2zm0-2h2v2h-2v-2zm-2-2h2v2h-2v-2zm0 0V8h-4v2h4zm-10 1h4v4h-4v-4z',
  flag: 'M3 2h10v2h8v14H11v-2H5v6H3V2zm2 12h8v2h6V6h-8V4H5v10z',
  forward: 'M14 5h-2v4H6v2H4v6h2v-2h6v4h2v-2h2v-2h2v-2h2v-2h-2V9h-2V7h-2V5z',
  frame: 'M2 3h20v18H2V3zm18 16V7H4v12h16z',
  gamepad:
    'M2 5h20v14H2V5zm18 12V7H4v10h16zM8 9h2v2h2v2h-2v2H8v-2H6v-2h2V9zm6 0h2v2h-2V9zm4 4h-2v2h2v-2z',
  'git-branch': 'M5 2h2v12h3v3h7v-7h-3V2h8v8h-3v9h-9v3H2v-8h3V2zm15 6V4h-4v4h4zM8 19v-3H4v4h4v-1z',
  github:
    'M5 2h4v2H7v2H5V2Zm0 10H3V6h2v6Zm2 2H5v-2h2v2Zm2 2v-2H7v2H3v-2H1v2h2v2h4v4h2v-4h2v-2H9Zm0 0v2H7v-2h2Zm6-12v2H9V4h6Zm4 2h-2V4h-2V2h4v4Zm0 6V6h2v6h-2Zm-2 2v-2h2v2h-2Zm-2 2v-2h2v2h-2Zm0 2h-2v-2h2v2Zm0 0h2v4h-2v-4Z',
  grid: 'M2 2h20v20H2V2zm2 2v4h4V4H4zm6 0v4h4V4h-4zm6 0v4h4V4h-4zm4 6h-4v4h4v-4zm0 6h-4v4h4v-4zm-6 4v-4h-4v4h4zm-6 0v-4H4v4h4zm-4-6h4v-4H4v4zm6-4v4h4v-4h-4z',
  group: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h4v4H7V7zm6 0h4v4h-4V7zm-6 6h4v4H7v-4zm6 0h4v4h-4v-4z',
  headphone: 'M19 4H5v2H3v14h7v-8H5V6h14v6h-5v8h7V6h-2V4zm-3 10h3v4h-3v-4zm-8 0v4H5v-4h3z',
  heart:
    'M9 2H5v2H3v2H1v6h2v2h2v2h2v2h2v2h2v2h2v-2h2v-2h2v-2h2v-2h2v-2h2V6h-2V4h-2V2h-4v2h-2v2h-2V4H9V2zm0 2v2h2v2h2V6h2V4h4v2h2v6h-2v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-2H3V6h2V4h4z',
  home: 'M14 2h-4v2H8v2H6v2H4v2H2v2h2v10h7v-6h2v6h7V12h2v-2h-2V8h-2V6h-2V4h-2V2zm0 2v2h2v2h2v2h2v2h-2v8h-3v-6H9v6H6v-8H4v-2h2V8h2V6h2V4h4z',
  hourglass:
    'M18 2H6v6h2v2h2v4H8v2H6v6h12v-6h-2v-2h-2v-4h2V8h2V2zm-2 6h-2v2h-4V8H8V4h8v4zm-2 6v2h2v4H8v-4h2v-2h4z',
  image:
    'M4 3H2v18h20V3H4zm16 2v14H4V5h16zm-6 4h-2v2h-2v2H8v2H6v2h2v-2h2v-2h2v-2h2v2h2v2h2v-2h-2v-2h-2V9zM8 7H6v2h2V7z',
  'info-box': 'M3 3h2v18H3V3zm16 0H5v2h14v14H5v2h16V3h-2zm-8 6h2V7h-2v2zm2 8h-2v-6h2v6z',
  keyboard:
    'M21 3H3v18h18V3zM5 19V5h14v14H5zM9 7H7v2h2V7zm8 8H7v2h10v-2zm-2-8h2v2h-2V7zm-2 0h-2v2h2V7zm-6 4h2v2H7v-2zm10 0h-2v2h2v-2zm-6 0h2v2h-2v-2z',
  label:
    'M12 2H2v10h2v2h2v2h2v2h2v2h2v2h2v-2h2v-2h2v-2h2v-2h2v-2h-2v-2h-2V8h-2V6h-2V4h-2V2zm0 2v2h2v2h2v2h2v2h2v2h-2v2h-2v2h-2v2h-2v-2h-2v-2H8v-2H6v-2H4V4h8zM6 6h2v2H6V6z',
  line: 'M20 2h2v2h-2zM18 4h2v2h-2zM16 6h2v2h-2zM14 8h2v2h-2zM12 10h2v2h-2zM10 12h2v2h-2zM8 14h2v2H8zM6 16h2v2H6zM4 18h2v2H4zM2 20h2v2H2z',
  loader:
    'M13 2h-2v6h2V2zm0 14h-2v6h2v-6zm9-5v2h-6v-2h6zM8 13v-2H2v2h6zm7-6h2v2h-2V7zm4-2h-2v2h2V5zM9 7H7v2h2V7zM5 5h2v2H5V5zm10 12h2v2h2v-2h-2v-2h-2v2zm-8 0v-2h2v2H7v2H5v-2h2z',
  lock: 'M15 2H9v2H7v4H4v14h16V8h-3V4h-2V2zm0 2v4H9V4h6zm-6 6h9v10H6V10h3zm4 3h-2v4h2v-4z',
  map: 'M8 2h2v2h2v2h-2v10H8V6H6V4h2V2zM4 8V6h2v2H4zm2 10v2H4v2H2V8h2v10h2zm0 0h2v-2H6v2zm6 0h-2v-2h2v2zm2-10V6h-2v2h2zm2 0h-2v10h-2v2h2v2h2v-2h2v-2h2v-2h2V2h-2v2h-2v2h-2v2zm0 0h2V6h2v10h-2v2h-2V8z',
  menu: 'M4 6h16v2H4V6zm0 5h16v2H4v-2zm16 5H4v2h16v-2z',
  message: 'M20 2H2v20h2V4h16v12H6v2H4v2h2v-2h16V2h-2z',
  'mood-happy':
    'M5 3h14v2H5V3zm0 16H3V5h2v14zm14 0v2H5v-2h14zm0 0h2V5h-2v14zM10 8H8v2h2V8zm4 0h2v2h-2V8zm-5 6v-2H7v2h2zm6 0v2H9v-2h6zm0 0h2v-2h-2v2z',
  'more-horizontal':
    'M1 9h6v6H1V9zm2 2v2h2v-2H3zm6-2h6v6H9V9zm2 2v2h2v-2h-2zm6-2h6v6h-6V9zm2 2v2h2v-2h-2z',
  move: 'M13 0h-2v2H9v2H7v2h2V4h2v7H4V9h2V7H4v2H2v2H0v2h2v2h2v2h2v-2H4v-2h7v7H9v-2H7v2h2v2h2v2h2v-2h2v-2h2v-2h-2v2h-2v-7h7v2h-2v2h2v-2h2v-2h2v-2h-2V9h-2V7h-2v2h2v2h-7V4h2v2h2V4h-2V2h-2V0z',
  music: 'M8 4h12v16h-8v-8h6V8h-8v12H2v-8h6V4zm0 10H4v4h4v-4zm10 0h-4v4h4v-4z',
  next: 'M6 4h2v2h2v2h2v2h2v4h-2v2h-2v2H8v2H6V4zm12 0h-2v16h2V4z',
  // The only entry here that does NOT come from the gallery cell of the same name. The gallery
  // draws an outline bell once; every one of the design's 24 actual bells — hub header and editor
  // header alike, 16px in ink-3 — is the solid one below. Usage wins over the library sheet, since
  // the header is what a person actually sees.
  notification: 'M9 2h6v2h2v2h2v6h2v2H3v-2h2V6h2V4h2V2zM10 16h4v2h-1v2h-2v-2h-1v-2z',
  // The gallery has no cell for these two, but the design draws both on the ART, MAP and SOUND tool
  // headers — the same slot the app puts them in. Eight pixels from the pixelarticons pair: the
  // arrowhead is one pixel thinner. Adopted so the header matches exactly.
  undo: 'M8 4h2v2H8V4zm10 6V8H8V6H6v2H4v2h2v2h2v2h2v-2H8v-2h10zm0 8v-8h2v8h-2zm0 0v2h-6v-2h6z',
  redo: 'M16 4h-2v2h2v2H6v2H4v8h2v2h6v-2H6v-8h10v2h-2v2h2v-2h2v-2h2V8h-2V6h-2V4z',
  // The design's mark for the docs, drawn on the reference pane's own header and on the console
  // strip's DOC tab. Named for the pane rather than the picture, which is the app's own word for it
  // (`docs.reference`, `referenceOpen`, `REFERENCE_WIDTH`).
  reference:
    'M3 3h8v2H3v12h8V5h2v12h8V5h-8V3h10v16H13v2h-2v-2H1V3h2zm16 7h-4v2h4v-2zm-4-3h4v2h-4V7zm2 6h-2v2h2v-2z',
  // The design draws one pen for both the ART tab's selected PEN tool and the inline edit
  // affordance, which is the app's `edit` in all three of its slots. Pixelarticons' pencil carries
  // sparkles the design's does not.
  edit: 'M18 2h-2v2h-2v2h-2v2h-2v2H8v2H6v2H4v2H2v6h6v-2h2v-2h2v-2h2v-2h2v-2h2v-2h2V8h2V6h-2V4h-2V2zm0 8h-2v2h-2v2h-2v2h-2v2H8v-2H6v-2h2v-2h2v-2h2V8h2V6h2v2h2v2zM6 16H4v4h4v-2H6v-2z',
  // Uncaptioned like the pen, and settled the same way -- each sits in the slot the app already
  // spends the name on. download / camera / upload are the GAME tab's EXPORT, GRAB FRAME and
  // UPLOAD, all three on the same artboard as the app's row; line is the ART tab's line tool; and
  // corner-down-right is the arrow the design sets beside REPLY.
  download:
    'M13 17V3h-2v10H9v-2H7v2h2v2h2v2h2zm8 2v-4h-2v4H5v-4H3v6h18v-2zm-8-6v2h2v-2h2v-2h-2v2h-2z',
  camera:
    'M9 3H7v2H2v16h20V5h-5V3H9zm8 4h3v12H4V7h5V5h6v2h2zm-7 2h4v2h-4V9zm4 6h-4v2h4v-2h2v-4h-2v4zm-6-4h2v4H8v-4z',
  upload: 'M11 5V3h2v2h2v2h2v2h-2V7h-2v10h-2V7H9v2H7V7h2V5h2zM3 15v6h18v-6h-2v4H5v-4H3z',
  line: 'M18 4h2v2h-2V4zm-2 4V6h2v2h-2zm-2 2V8h2v2h-2zm-2 2v-2h2v2h-2zm-2 2v-2h2v2h-2zm-2 2v-2h2v2H8zm-2 2v-2h2v2H6zm0 0v2H4v-2h2z',
  'corner-down-right': 'M6 16h10v2h2v-2h2v-2h-2v-2h-2v2H6V4H4v12h2zm10-4v-2h-2v2h2zm0 6v2h-2v-2h2z',
  // Same rule again: each has exactly one slot in the app, and it is the slot the design draws it
  // in. checkbox and circle are the ART and MAP select and ellipse tools -- the design's ellipse is
  // an octagon, which is what a circle is on this grid. copy is the friend code's, logout the
  // account menu's.
  checkbox: 'M5 3H3v18h18V3H5zm0 2h14v14H5V5zm4 7H7v2h2v2h2v-2h2v-2h2v-2h2V8h-2v2h-2v2h-2v2H9v-2z',
  circle: 'M17 3H7v2H5v2H3v10h2v2h2v2h10v-2h2v-2h2V7h-2V5h-2V3zm0 2v2h2v10h-2v2H7v-2H5V7h2V5h10z',
  copy: 'M4 2h11v2H6v13H4V2zm4 4h12v16H8V6zm2 2v12h8V8h-8z',
  logout:
    'M5 3h16v4h-2V5H5v14h14v-2h2v4H3V3h2zm16 8h-2V9h-2V7h-2v2h2v2H7v2h10v2h-2v2h2v-2h2v-2h2v-2z',
  // The mark the design sets on BRING BACK THE VIEWER: a screen with a plus. Named for the action
  // the app already calls it (editor.dockViewer), not for the picture.
  dock: 'M2 4h20v16H2V4zm2 2v12h16V6H4zm8 3h2v2h-2v2h-2v-2H8V9h2V7h2v2z',
  // The SOUND pattern transport, where the app had no glyph of its own to reach for: it stopped
  // with the dialogs' close cross and kept time with a speaker. Both are additions rather than
  // overrides -- close is still a cross in its eight other slots, and volume-2 is still a speaker.
  stop: 'M3 3h18v18H3V3zm2 2v14h14V5H5z',
  metronome:
    'M13 2h-2v2H9v2H7v2H5v2H3v12h18V10h-2V8h-2V6h-2V4h-2V2zm0 2v2h2v2h2v2h2v10H5V10h2V8h2V6h2V4h2z',
  'paint-bucket':
    'M8 3h8v2H8V3zm0 2H6v4H4v12h16V9h-2V5h-2v4H8V5zm8 6h2v8H6v-8h2v6h2v-4h2v2h2v-2h2v-2z',
  pause: 'M10 4H5v16h5V4zm9 0h-5v16h5V4z',
  pip: 'M2 4h20v6h-2V6H4v12h8v2H2V4zm10 8h10v8H12v-8z',
  play: 'M10 20H8V4h2v2h2v3h2v2h2v2h-2v2h-2v3h-2v2z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z',
  prev: 'M6 4h2v16H6V4zm12 0h-2v2h-2v3h-2v2h-2v2h2v3h2v2h2v2h2V4z',
  reload:
    'M16 2h-2v2h2v2H4v2H2v5h2V8h12v2h-2v2h2v-2h2V8h2V6h-2V4h-2V2zM6 20h2v2h2v-2H8v-2h12v-2h2v-5h-2v5H8v-2h2v-2H8v2H6v2H4v2h2v2z',
  repeat:
    'M11 1H9v2h2v2H5v2H3v10h2v2h2v-2H5V7h6v2H9v2h2V9h2V7h2V5h-2V3h-2V1zm8 4h-2v2h2v10h-6v-2h2v-2h-2v2h-2v2H9v2h2v2h2v2h2v-2h-2v-2h6v-2h2V7h-2V5z',
  save: 'M4 2h14v2H4v16h2v-6h12v6h2V6h2v16H2V2h2zm4 18h8v-4H8v4zM20 6h-2V4h2v2zM6 6h9v4H6V6z',
  search:
    'M6 2h8v2H6V2zM4 6V4h2v2H4zm0 8H2V6h2v8zm2 2H4v-2h2v2zm8 0v2H6v-2h8zm2-2h-2v2h2v2h2v2h2v2h2v-2h-2v-2h-2v-2h-2v-2zm0-8h2v8h-2V6zm0 0V4h-2v2h2z',
  shuffle:
    'M18 5h-2v2h2v2h-6v2h-2v6H2v2h8v-2h2v-6h6v2h-2v2h2v-2h2v-2h2V9h-2V7h-2V5zM2 9h6v2H2V9zm20 10v-2h-8v2h8z',
  sliders:
    'M17 4h2v10h-2V4zm0 12h-2v2h2v2h2v-2h2v-2h-4zm-4-6h-2v10h2V10zm-8 2H3v2h2v6h2v-6h2v-2H5zm8-8h-2v2H9v2h6V6h-2V4zM5 4h2v6H5V4z',
  sync: 'M4 9V7h12V5h2v2h2v2h-2v2h-2V9H4zm12 2h-2v2h2v-2zm0-6h-2V3h2v2zm4 12v-2H8v-2h2v-2H8v2H6v2H4v2h2v2h2v2h2v-2H8v-2h12z',
  trash:
    'M16 2v4h6v2h-2v14H4V8H2V6h6V2h8zm-2 2h-4v2h4V4zm0 4H6v12h12V8h-4zm-5 2h2v8H9v-8zm6 0h-2v8h2v-8z',
  'trending-up':
    'M14 6h8v8h-2v-4h-2V8h-4V6zm2 6v-2h2v2h-2zm-2 2v-2h2v2h-2zm-2 0h2v2h-2v-2zm-2-2h2v2h-2v-2zm-2 0v-2h2v2H8zm-2 2v-2h2v2H6zm-2 2v-2h2v2H4zm0 0v2H2v-2h2z',
  trophy:
    'M16 3H6v2H2v10h6V5h8v10h6V5h-4V3h-2zm4 4v6h-2V7h2zM6 13H4V7h2v6zm12 2H6v2h12v-2zm-7 2h2v2h3v2H8v-2h3v-2z',
  user: 'M15 2H9v2H7v6h2V4h6V2zm0 8H9v2h6v-2zm0-6h2v6h-2V4zM4 16h2v-2h12v2H6v4h12v-4h2v6H4v-6z',
  users:
    'M11 0H5v2H3v6h2v2h6V8H5V2h6V0zm0 2h2v6h-2V2zM0 14h2v4h12v2H0v-6zm2 0h12v-2H2v2zm14 0h-2v6h2v-6zM15 0h4v2h-4V0zm4 8h-4v2h4V8zm0-6h2v6h-2V2zm5 12h-2v4h-4v2h6v-6zm-6-2h4v2h-4v-2z',
  'volume-2':
    'M11 2h2v20h-2v-2H9v-2h2V6H9V4h2V2zM7 8V6h2v2H7zm0 8H3V8h4v2H5v4h2v2zm0 0v2h2v-2H7zm10-6h-2v4h2v-4zm2-2h2v8h-2V8zm0 8v2h-4v-2h4zm0-10v2h-4V6h4z',
  'volume-x':
    'M13 2h-2v2H9v2H7v2H3v8h4v2h2v2h2v2h2V2zM9 18v-2H7v-2H5v-4h2V8h2V6h2v12H9zm10-6.777h-2v-2h-2v2h2v2h-2v2h2v-2h2v2h2v-2h-2v-2zm0 0h2v-2h-2v2z',
  'warning-box': 'M3 3h16v2H5v14h14v2H3V3zm18 0h-2v18h2V3zM11 15h2v2h-2v-2zm2-8h-2v6h2V7z',
  zap: 'M12 1h2v8h8v4h-2v-2h-8V5h-2V3h2V1zM8 7V5h2v2H8zM6 9V7h2v2H6zm-2 2V9h2v2H4zm10 8v2h-2v2h-2v-8H2v-4h2v2h8v6h2zm2-2v2h-2v-2h2zm2-2v2h-2v-2h2zm0 0h2v-2h-2v2z',
  'zoom-in':
    'M14 2H6v2H4v2H2v8h2v2h2v2h8v-2h2v2h2v2h2v2h2v-2h-2v-2h-2v-2h-2v-2h2V6h-2V4h-2V2zm0 2v2h2v8h-2v2H6v-2H4V6h2V4h8zM9 6h2v3h3v2h-3v3H9v-3H6V9h3V6z',
  'zoom-out':
    'M14 2H6v2H4v2H2v8h2v2h2v2h8v-2h2v2h2v2h2v2h2v-2h-2v-2h-2v-2h-2v-2h2V6h-2V4h-2V2zm0 2v2h2v8h-2v2H6v-2H4V6h2V4h8zm0 5v2H6V9h8z',
};

const byName = new Map();
for (const [name, file] of Object.entries(aliases)) {
  const svg = await readFile(`${svgDir}/${file}.svg`, 'utf8');
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error(`${name}: no <path d> found`);
  byName.set(name, paths.join(' '));
}
// Last, so a design glyph replaces the pixelarticons one of the same name rather than colliding
// with it.
for (const [name, d] of Object.entries(CUSTOM)) byName.set(name, d);

const entries = [...byName].map(([name, d]) => `  '${name}': '${d}',`);
entries.sort();

const out = `// GENERATED by tools/build-icons.mjs from pixelarticons ${require('pixelarticons/package.json').version} (MIT). Do not edit.
export const ICON_PATHS = {
${entries.join('\n')}
} as const;

export type IconName = keyof typeof ICON_PATHS;
`;
const target = resolve(root, 'packages/ui/src/icons/paths.ts');

// Losing CUSTOM puts every design glyph back to its pixelarticons lookalike under the same name:
// every name still resolves, every icon still draws, and nothing reports a problem. Breaking that
// silence is the point of this mode.
if (process.argv.includes('--check')) {
  // Compared as name -> path, not byte for byte: the committed file is Prettier's, which wraps the
  // long paths onto their own line, so the generator's own text never matches it verbatim.
  const current = await readFile(target, 'utf8').catch(() => '');
  const found = new Map();
  for (const m of current.matchAll(/'?([a-zA-Z0-9-]+)'?:\s*\n?\s*'([^']+)'/g)) {
    found.set(m[1], m[2]);
  }

  const drift = [];
  for (const [name, d] of byName) {
    if (!found.has(name)) drift.push(`missing: ${name}`);
    else if (found.get(name) !== d) drift.push(`different picture: ${name}`);
  }
  for (const name of found.keys()) if (!byName.has(name)) drift.push(`unexpected: ${name}`);

  if (drift.length > 0) {
    console.error(
      `build-icons: packages/ui/src/icons/paths.ts disagrees with the generator ` +
        `(${String(drift.length)}):\n  ${drift.join('\n  ')}\n` +
        'Run `node tools/build-icons.mjs`, then Prettier, and commit the result.',
    );
    process.exit(1);
  }
  console.warn(`build-icons: paths.ts matches the generator (${byName.size} icons)`);
} else {
  await writeFile(target, out);
  console.warn(`build-icons: wrote ${entries.length} icons`);
}
