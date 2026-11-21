import type { GameAction, PadControl } from './actions';

/** The gamepad controls the on-screen pad has a place for. */
export const TOUCH_CONTROLS = [
  'dpad-up',
  'dpad-down',
  'dpad-left',
  'dpad-right',
  'a',
  'b',
  'x',
  'y',
  'start',
] as const;
export type TouchControl = (typeof TOUCH_CONTROLS)[number];

/** The cross is the only directional control a screen has, so each arm is the left stick's too. */
const CROSS_STICK: Partial<Record<TouchControl, PadControl>> = {
  'dpad-up': 'stick-up',
  'dpad-down': 'stick-down',
  'dpad-left': 'stick-left',
  'dpad-right': 'stick-right',
};

/** Every gamepad control a touch on this control of the on-screen pad presses. */
export function touchPresses(control: TouchControl): PadControl[] {
  const stick = CROSS_STICK[control];

  return stick ? [control, stick] : [control];
}

function padControlsOf(actions: readonly GameAction[]): Set<PadControl> {
  const used = new Set<PadControl>();
  for (const action of actions) {
    for (const input of action.inputs) {
      if (input.kind === 'pad') {
        used.add(input.control);
      }
    }
  }

  return used;
}

/** The controls the on-screen pad shows for a game: those some action is plugged into. */
export function touchControlsOf(actions: readonly GameAction[]): TouchControl[] {
  const used = padControlsOf(actions);

  return TOUCH_CONTROLS.filter((control) =>
    touchPresses(control).some((pressed) => used.has(pressed)),
  );
}

/** The gamepad controls a game uses that the on-screen pad has no place for. */
export function touchUnreachable(actions: readonly GameAction[]): PadControl[] {
  const reachable = new Set(TOUCH_CONTROLS.flatMap(touchPresses));

  return [...padControlsOf(actions)].filter((control) => !reachable.has(control));
}
