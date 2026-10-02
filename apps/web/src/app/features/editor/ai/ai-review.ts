import type { AiProposalResponseDto } from '@naucto/api-client';

/** The editors that each get their own acceptance of what the assistant staged. */
export type AiEditor = 'code' | 'art' | 'map' | 'sound' | 'net';

/** Which catalogue entries belong to which editor: a sprite is art, a stamped section is a map. */
const CATALOG_EDITOR: Record<string, AiEditor> = {
  sprite: 'art',
  tile: 'art',
  animation: 'art',
  section: 'map',
  music: 'sound',
  sfx: 'sound',
};

/**
 * The editor an operation is judged in.
 *
 * Judged where its result is seen: pixels in the art editor, tiles and maps in the map editor, and
 * so on. Anything unrecognised has no editor, so it is never offered somewhere it cannot be read.
 */
export function editorOf(operation: unknown): AiEditor | null {
  if (!operation || typeof operation !== 'object') return null;
  const op = operation as { kind?: unknown; after?: unknown; before?: unknown };
  switch (op.kind) {
    case 'code':
      return 'code';
    case 'pixels':
      return 'art';
    case 'tiles':
    case 'create_map':
    case 'resize_map':
    case 'delete_map':
      return 'map';
    case 'sound':
    case 'delete_sound':
      return 'sound';
    case 'net_permissions':
      return 'net';
    case 'catalog': {
      const entry = (op.after ?? op.before) as { kind?: unknown } | null | undefined;
      return typeof entry?.kind === 'string' ? (CATALOG_EDITOR[entry.kind] ?? null) : null;
    }
    default:
      return null;
  }
}

/** Every editor a proposal has something to show in, in no particular order. */
export function editorsOf(proposal: Pick<AiProposalResponseDto, 'operations'>): Set<AiEditor> {
  const out = new Set<AiEditor>();
  const operations: unknown = proposal.operations;
  if (!Array.isArray(operations)) return out;
  for (const operation of operations) {
    const editor = editorOf(operation);
    if (editor) out.add(editor);
  }
  return out;
}

/**
 * The proposals one editor shows: everything of its own still waiting, and the few it applied last,
 * so a change that turned out wrong can still be taken back from the place it was made.
 */
export function proposalsFor(
  proposals: readonly AiProposalResponseDto[],
  editor: AiEditor,
): AiProposalResponseDto[] {
  const mine = proposals.filter((proposal) => editorsOf(proposal).has(editor));
  const waiting = mine.filter((proposal) => proposal.status === 'PENDING');
  const recent = mine
    .filter((proposal) => proposal.status === 'APPLIED' && proposal.inverse)
    .slice(0, 3);

  return [...waiting, ...recent];
}
