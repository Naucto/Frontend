import { Directive } from '@angular/core';

/** One frame on the panel ground, so the bands show whatever the table stands on. */
const FRAME =
  'flat-sm bevel-edge-line-strong bevel-fill-panel w-full border-separate border-spacing-0 text-left';

/** Every other row stands on the inset ground. A second `tbody` starts its own count. */
const BANDS = '[&_tbody_tr:nth-child(odd)]:bg-inset';

const HEAD =
  '[&_thead_th]:py-1 [&_thead_th]:text-label [&_thead_th]:font-normal [&_thead_th]:tracking-label [&_thead_th]:whitespace-nowrap [&_thead_th]:text-ink-3 [&_thead_th]:uppercase';

/** A row is named by its `th`, whose `small` is the line under the name. */
const ROWS =
  '[&_tbody_th]:py-1 [&_tbody_th]:text-body [&_tbody_th]:font-normal [&_tbody_th]:text-ink ' +
  '[&_tbody_td]:py-1 [&_tbody_td]:text-body [&_tbody_td]:text-ink-body ' +
  '[&_small]:block [&_small]:text-meta [&_small]:text-ink-3';

/** A cell keeps less room around it on a phone, where every column counts. */
const CELLS =
  '[&_td]:px-1 [&_td]:align-middle [&_th]:px-1 [&_th]:align-middle sm:[&_td]:px-1.5 sm:[&_th]:px-1.5';

const CAPTION =
  '[&_caption]:pb-1 [&_caption]:text-left [&_caption]:text-label [&_caption]:tracking-label [&_caption]:text-ink-3 [&_caption]:uppercase';

/**
 * A table: a head row of labels, rows named by their first cell, cells that line up. No rule is
 * drawn under a row: every other one stands on a band, inside one frame.
 *
 * Styles native markup (`table`, `caption`, `thead`, `tbody`, `tr`, `th`, `td`), so a screen
 * reader gets the rows and the headers the browser already knows how to say: give a column head
 * `scope="col"` and the cell that names a row `scope="row"`.
 */
@Directive({
  selector: 'table[ncTable]',
  host: { class: `${FRAME} ${BANDS} ${HEAD} ${ROWS} ${CELLS} ${CAPTION}` },
})
export class TableDirective {}
