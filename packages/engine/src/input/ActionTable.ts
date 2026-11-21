import { type GameAction, MAX_ACTIONS, type PadControl } from './actions';

/** A game's actions as the input path reads them: one bit each, and the bits every input sets. */
export interface ActionTable {
  /** Action name → its bit. */
  readonly bits: ReadonlyMap<string, number>;
  /** Per keyboard player: key → the bits of every action it is plugged into. */
  readonly keys: readonly [ReadonlyMap<string, number>, ReadonlyMap<string, number>];
  readonly pad: ReadonlyMap<PadControl, number>;
}

export const NO_ACTIONS: ActionTable = {
  bits: new Map(),
  keys: [new Map(), new Map()],
  pad: new Map(),
};

/** Actions past {@link MAX_ACTIONS} get no bit: a shift by 32 wraps onto the first one. */
export function buildActionTable(actions: readonly GameAction[]): ActionTable {
  const bits = new Map<string, number>();
  const keys: [Map<string, number>, Map<string, number>] = [
    new Map<string, number>(),
    new Map<string, number>(),
  ];
  const pad = new Map<PadControl, number>();
  actions.slice(0, MAX_ACTIONS).forEach((action, i) => {
    const bit = 1 << i;
    bits.set(action.name, bit);
    for (const input of action.inputs) {
      if (input.kind === 'key') {
        const byKey = keys[input.player];
        byKey.set(input.key, (byKey.get(input.key) ?? 0) | bit);
      } else {
        pad.set(input.control, (pad.get(input.control) ?? 0) | bit);
      }
    }
  });

  return { bits, keys, pad };
}
