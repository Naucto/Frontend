/** The width of a disk in a collection box. */
export const DOCK_DISK = 96;
/** How far apart the disks of a box stand while it is at rest. */
const STEP = 12;
/** The circle the disks ride once the box is reached: its radius, and how far it is raised. */
const RADIUS = 520;
const RAISED = 26;
/** How much further the disk at the crown rises. */
const CROWN = 18;

export interface DiskPose {
  left: number;
  x: number;
  y: number;
  scale: number;
  z: number;
}

/** How many disks stand a step apart without passing the end of a row that wide. */
export function dockFits(row: number): number {
  return Math.floor((row - DOCK_DISK) / STEP) + 1;
}

/**
 * Where a disk stands at rest: a step apart from the left, or, for a collection too large for
 * that, `count` places spread over the whole row.
 */
export function restPose(index: number, count: number, spread: boolean, row: number): DiskPose {
  return {
    left: spread ? Math.round(((row - DOCK_DISK) * index) / count) : index * STEP,
    x: 0,
    y: 0,
    scale: 1,
    z: index + 1,
  };
}

/**
 * Where a disk stands once the box is reached and `focus` is the one at the crown; between two
 * whole numbers the dock is being dragged from one disk to the next. The disks ride a circle
 * without turning: wide apart near the crown, tighter further out, and no further than the row
 * leaves room for. The crown disk is a third larger, so one of its pixels is four where a
 * neighbour's is three.
 */
export function dockPose(index: number, focus: number, row: number): DiskPose {
  const offset = index - focus;
  const distance = Math.abs(offset);
  const reach = Math.max(60, Math.min(220, row / 2 - 40));
  const x =
    Math.sign(offset) *
    Math.min(reach, 80 * Math.min(distance, 1) + 36 * Math.max(0, distance - 1));
  const crown = Math.max(0, 1 - distance);
  return {
    left: Math.round((row - DOCK_DISK) / 2),
    x: Math.round(x),
    y: Math.round(RADIUS - Math.sqrt(RADIUS * RADIUS - x * x) - RAISED - CROWN * crown),
    scale: 1 + crown / 3,
    z: Math.max(2, 100 - Math.round(distance * 10)),
  };
}
