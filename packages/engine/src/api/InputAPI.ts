import { isAction } from '../input/ActionMap';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import { defineLuaNamespace, luaFn, param } from './lua-namespace';

const player = param.index('player', { default: 1 });

export const INPUT_API = defineLuaNamespace<InputAPI>('input', {
  held: luaFn(
    {
      summary: 'True while an action (left right up down a b x y pause) is held.',
      params: [param.string('action'), player],
      returns: 'boolean',
    },
    'held',
  ),
  pressed: luaFn(
    {
      summary: 'True on the step an action was pressed.',
      params: [param.string('action'), player],
      returns: 'boolean',
    },
    'pressed',
  ),
  released: luaFn(
    {
      summary: 'True on the step an action was released.',
      params: [param.string('action'), player],
      returns: 'boolean',
    },
    'released',
  ),
  key_pressed: luaFn(
    {
      summary: 'True while a keyboard key (event.key name) is held.',
      params: [param.string('key')],
      returns: 'boolean',
    },
    'keyPressed',
  ),
  key_down: luaFn(
    {
      summary: 'True on the step a key went down.',
      params: [param.string('key')],
      returns: 'boolean',
    },
    'keyDown',
  ),
  get_mouse_pos: luaFn(
    {
      summary: 'Mouse x, y in screen pixels (nil when outside).',
      params: [],
      returns: 'number|nil',
    },
    'mousePosition',
  ),
  mouse_pressed: luaFn(
    {
      summary: 'True while a mouse button is held.',
      params: [param.number('button', { default: 0 })],
      returns: 'boolean',
    },
    'mousePressed',
  ),
  mouse_down: luaFn(
    {
      summary: 'True on the step a mouse button was pressed.',
      params: [param.number('button', { default: 0 })],
      returns: 'boolean',
    },
    'mouseDown',
  ),
  players: luaFn(
    {
      summary: 'Number of connected players (keyboard counts as one).',
      params: [],
      returns: 'number',
    },
    'players',
  ),
});

/** The `input` namespace. A player below the first reads as the first. */
export class InputAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.registerNamespace(INPUT_API, this);
  }

  held(action: string, playerIndex: number): boolean {
    return isAction(action) && this.ctx.input.btn(action, Math.max(0, playerIndex));
  }

  pressed(action: string, playerIndex: number): boolean {
    return isAction(action) && this.ctx.input.btnp(action, Math.max(0, playerIndex));
  }

  released(action: string, playerIndex: number): boolean {
    return isAction(action) && this.ctx.input.btnr(action, Math.max(0, playerIndex));
  }

  keyPressed(key: string): boolean {
    return this.ctx.input.keyPressed(key);
  }

  keyDown(key: string): boolean {
    return this.ctx.input.keyDown(key);
  }

  /** x and y as two values, or two nils while the pointer is off the screen. */
  mousePosition(): [number, number | null] | [undefined, undefined] {
    const input = this.ctx.input;
    return input.mouseX === null ? [undefined, undefined] : [input.mouseX, input.mouseY];
  }

  mousePressed(button: number): boolean {
    return this.ctx.input.mousePressed(button);
  }

  mouseDown(button: number): boolean {
    return this.ctx.input.mouseDown(button);
  }

  players(): number {
    return this.ctx.input.connectedPlayers;
  }

  /** A run does not hand the next one what it was holding. */
  override destroy(): void {
    this.ctx.input.reset();
  }
}
