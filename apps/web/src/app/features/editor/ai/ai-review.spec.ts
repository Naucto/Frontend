import type { AiProposalResponseDto } from '@naucto/api-client';
import { describe, expect, it } from 'vitest';

import { editorOf, editorsOf, proposalsFor } from './ai-review';

const proposal = (
  id: string,
  status: string,
  operations: unknown[],
  inverse: unknown = null,
): AiProposalResponseDto =>
  ({ id, status, operations, inverse }) as unknown as AiProposalResponseDto;

describe('editorOf', () => {
  it('sends each operation to the editor where its result is seen', () => {
    expect(editorOf({ kind: 'code' })).toBe('code');
    expect(editorOf({ kind: 'pixels' })).toBe('art');
    expect(editorOf({ kind: 'tiles' })).toBe('map');
    expect(editorOf({ kind: 'resize_map' })).toBe('map');
    expect(editorOf({ kind: 'sound' })).toBe('sound');
    expect(editorOf({ kind: 'net_permissions' })).toBe('net');
  });

  it('files a catalogue entry by what it describes', () => {
    expect(editorOf({ kind: 'catalog', after: { kind: 'sprite' } })).toBe('art');
    expect(editorOf({ kind: 'catalog', before: { kind: 'sfx' }, after: null })).toBe('sound');
    expect(editorOf({ kind: 'catalog', after: { kind: 'section' } })).toBe('map');
  });

  it('has no editor for what it does not recognise', () => {
    expect(editorOf({ kind: 'mystery' })).toBeNull();
    expect(editorOf(null)).toBeNull();
  });
});

describe('proposalsFor', () => {
  const list = [
    proposal('a', 'PENDING', [{ kind: 'pixels' }, { kind: 'code' }]),
    proposal('b', 'PENDING', [{ kind: 'code' }]),
    proposal('c', 'REJECTED', [{ kind: 'pixels' }]),
    proposal('d', 'APPLIED', [{ kind: 'pixels' }], [{ kind: 'pixels' }]),
    proposal('e', 'APPLIED', [{ kind: 'pixels' }], null),
  ];

  it('offers a mixed change in every editor it touches', () => {
    expect(editorsOf(list[0]!)).toEqual(new Set(['art', 'code']));
    expect(proposalsFor(list, 'code').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('shows what waits, then what can still be taken back, and never what was refused', () => {
    expect(proposalsFor(list, 'art').map((p) => p.id)).toEqual(['a', 'd']);
  });

  it('shows nothing in an editor the change does not touch', () => {
    expect(proposalsFor(list, 'sound')).toEqual([]);
  });
});
