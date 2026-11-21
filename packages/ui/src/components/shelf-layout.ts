/** The gap between two items of a shelf. */
export const SHELF_GAP = 16;
/** The room on each side of the track where the neighbouring pages show through the dither. */
export const SHELF_PEEK = 54;
/** An item is never narrower than this while more than two fit. */
const ITEM_MIN = 220;
/** The widest the text beside an item gets. */
const BODY_MAX = 380;

export interface ShelfLayout {
  /** Items across a page. */
  per: number;
  itemWidth: number;
  pages: number;
}

/**
 * How a track of that width pages that many items: as many across as fit at their least width,
 * two at least, on as many rows as it is given.
 */
export function shelfLayout(width: number, count: number, rows = 1): ShelfLayout {
  const per = Math.max(2, Math.floor((width + SHELF_GAP) / (ITEM_MIN + SHELF_GAP)));
  return {
    per,
    itemWidth: Math.floor((width - (per - 1) * SHELF_GAP) / per),
    pages: Math.max(1, Math.ceil(count / (per * rows))),
  };
}

export interface ShelfPlace {
  page: number;
  /** From 0, on its page. */
  row: number;
  column: number;
}

/** Where an item stands: pages follow one another, and each is filled row by row. */
export function shelfPlace(index: number, per: number, rows: number): ShelfPlace {
  return {
    page: Math.floor(index / (per * rows)),
    row: Math.floor((index % (per * rows)) / per),
    column: index % per,
  };
}

export interface FlyoutPlacement {
  /** The side of the item the text opens on. */
  side: 'left' | 'right';
  /** How far the frame passes the item on its sides, and above and below it. */
  gutter: number;
  rise: number;
  /** The frame's whole width: the item, its gutters and the text. */
  width: number;
  /** The frame's left edge, from the left edge of the track. */
  left: number;
}

/**
 * Where the frame around an item of that column opens. The text goes to the right while there is
 * room for it there, or at least as much as on the left, and takes what the track leaves it up to
 * its widest; it may run into most of the peek.
 */
export function flyoutPlacement(width: number, itemWidth: number, column: number): FlyoutPlacement {
  const x = column * (itemWidth + SHELF_GAP);
  const gutter = Math.min(38, Math.round(itemWidth * 0.1) + 8);
  const reach = SHELF_PEEK - SHELF_GAP;
  const roomRight = width - x - itemWidth - gutter + reach;
  const roomLeft = x - gutter + reach;
  const right = roomRight >= Math.min(BODY_MAX, roomLeft);
  const frame = itemWidth + 2 * gutter + 32 + Math.min(BODY_MAX, right ? roomRight : roomLeft);
  return {
    side: right ? 'right' : 'left',
    gutter,
    rise: Math.min(44, Math.round(itemWidth * 1.02 * 0.1) + 10),
    width: frame,
    left: right ? x - SHELF_GAP - gutter : x + itemWidth + SHELF_GAP + gutter - frame,
  };
}
