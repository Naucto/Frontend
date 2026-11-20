/**
 * The marks a control carries where a 24px icon has no room: each is drawn for its size, on a grid
 * of five cells by five whose cell is one kit pixel, so it is 15px across and never scaled.
 */
export const MARK_PATHS = {
  'arrow-down':
    'M2 0h1v1h-1zM2 1h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1zM4 2h1v1h-1zM1 3h3v1h-3zM2 4h1v1h-1z',
  'arrow-left': 'M2 0h1v1h-1zM1 1h1v1h-1zM0 2h5v1h-5zM1 3h1v1h-1zM2 4h1v1h-1z',
  'arrow-right': 'M2 0h1v1h-1zM3 1h1v1h-1zM0 2h5v1h-5zM3 3h1v1h-1zM2 4h1v1h-1z',
  'arrow-up':
    'M2 0h1v1h-1zM1 1h3v1h-3zM0 2h1v1h-1zM2 2h1v1h-1zM4 2h1v1h-1zM2 3h1v1h-1zM2 4h1v1h-1z',
  'caret-down': 'M0 1h5v1h-5zM1 2h3v1h-3zM2 3h1v1h-1z',
  'caret-left': 'M3 0h1v1h-1zM2 1h2v1h-2zM1 2h3v1h-3zM2 3h2v1h-2zM3 4h1v1h-1z',
  'caret-right': 'M1 0h1v1h-1zM1 1h2v1h-2zM1 2h3v1h-3zM1 3h2v1h-2zM1 4h1v1h-1z',
  'caret-up': 'M2 1h1v1h-1zM1 2h3v1h-3zM0 3h5v1h-5z',
  check: 'M4 1h1v1h-1zM3 2h1v1h-1zM0 3h1v1h-1zM2 3h1v1h-1zM1 4h1v1h-1z',
  'chevron-down': 'M0 1h1v1h-1zM4 1h1v1h-1zM1 2h1v1h-1zM3 2h1v1h-1zM2 3h1v1h-1z',
  'chevron-left': 'M3 0h1v1h-1zM2 1h1v1h-1zM1 2h1v1h-1zM2 3h1v1h-1zM3 4h1v1h-1z',
  'chevron-right': 'M1 0h1v1h-1zM2 1h1v1h-1zM3 2h1v1h-1zM2 3h1v1h-1zM1 4h1v1h-1z',
  'chevron-up': 'M2 1h1v1h-1zM1 2h1v1h-1zM3 2h1v1h-1zM0 3h1v1h-1zM4 3h1v1h-1z',
  close:
    'M0 0h1v1h-1zM4 0h1v1h-1zM1 1h1v1h-1zM3 1h1v1h-1zM2 2h1v1h-1zM1 3h1v1h-1zM3 3h1v1h-1zM0 4h1v1h-1zM4 4h1v1h-1z',
  minus: 'M0 2h5v1h-5z',
  plus: 'M2 0h1v1h-1zM2 1h1v1h-1zM0 2h5v1h-5zM2 3h1v1h-1zM2 4h1v1h-1z',
} as const;

export type MarkName = keyof typeof MARK_PATHS;
