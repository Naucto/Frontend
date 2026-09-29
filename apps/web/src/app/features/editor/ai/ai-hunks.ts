import { changedLineHunks } from '@naucto/engine';

/** The lines a person chose, by file. Empty or absent for a file means nothing in it was chosen. */
/** A run of chosen lines, by file. The file is the key, so it is not repeated on the range. */
export type ChosenHunks = Record<string, LineRange[]>;

export interface LineRange {
  from: number;
  to: number;
}

/** A chosen run, carrying the file it belongs to, as the API takes it. */
export interface HunkRange extends LineRange {
  fileId: string;
}

/**
 * What to send with an apply: the lines actually chosen, and nothing else.
 *
 * A file nobody chose a line in is left out entirely, which is what makes the server apply it whole.
 * Sending it a range covering the file instead reads as a selection of everything, and the server
 * narrows to it — finding no changed lines in a range that contained all of them, and refusing the
 * whole change. That made accepting a change without picking through it impossible, which is the
 * common case and the one the button is named after.
 *
 * The ranges are re-derived from the proposed text rather than remembered as chosen, so a selection
 * made against an older preview cannot name lines the current one does not have.
 */
export function chosenHunkRanges(
  chosen: ChosenHunks,
  files: { id: string; before: string; after: string }[],
): {
  fileId: string;
  from: number;
  to: number;
}[] {
  const out: { fileId: string; from: number; to: number }[] = [];
  for (const file of files) {
    const picked = chosen[file.id];
    if (!picked?.length) continue;
    for (const hunk of changedLineHunks(file.before, file.after)) {
      if (picked.some((p) => p.from === hunk.from))
        out.push({ fileId: file.id, from: hunk.from, to: hunk.to });
    }
  }
  return out;
}
