import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import type { MigrationReport } from '../types';
import { migrateCode } from './code';

const fresh = (): MigrationReport => ({ from: 1, to: 2, applied: false, counts: {}, warnings: [] });

/** Runs the rewrite over a source and hands back what it became, its report and its labels. */
function rewrite(source: string): {
  text: string;
  report: MigrationReport;
  declared: ReturnType<typeof migrateCode>;
} {
  const doc = new Y.Doc();
  const text = doc.getText('code');
  text.insert(0, source);
  const report = fresh();
  const declared = migrateCode(text, report, 'main');

  return { text: text.toString(), report, declared };
}

describe('v1 → v2 code rewrite', () => {
  it('renames the three action readers wherever they are called', () => {
    const { text, report } = rewrite(
      [
        'if input.btn("left") then x = x - 1 end',
        'if input.btnp ("a") and input.btnr("b", 2) then jump() end',
        'local was_held = input.btn',
      ].join('\n'),
    );

    expect(text).toBe(
      [
        'if input.held("left") then x = x - 1 end',
        'if input.pressed ("a") and input.released("b", 2) then jump() end',
        'local was_held = input.held',
      ].join('\n'),
    );
    expect(report.counts['rewrites:main']).toBe(4);
    expect(report.warnings).toEqual([]);
  });

  it('leaves the old names alone inside strings and comments', () => {
    const source = [
      '-- input.btn("left") is how it used to read',
      '--[[ input.btnp("a")',
      '     input.btnr("a") ]]',
      'print("call input.btn(\\"a\\") here")',
      "print('input.btnp')",
      'local doc = [[input.btnr("b")]]',
      'if input.btn("a") then end',
    ].join('\n');

    const { text } = rewrite(source);

    expect(text).toBe(source.replace('if input.btn("a")', 'if input.held("a")'));
  });

  it('does not touch a longer name that merely contains one of the old ones', () => {
    const source = [
      'myinput.btn("a")',
      'input.btnx("a")',
      'input.btn_old("a")',
      'x.input.btn("a")',
      'input_btn("a")',
    ].join('\n');

    const { text, report } = rewrite(source);

    expect(text).toBe(source);
    expect(report.counts['rewrites:main']).toBe(0);
  });

  it('survives a file still being typed', () => {
    const { text } = rewrite('if input.btn("left\nfunction _update()\n  input.btnp(');

    expect(text).toBe('if input.held("left\nfunction _update()\n  input.pressed(');
  });

  it('moves a literal input.declare to the labels and cuts the statement out', () => {
    const { text, declared, report } = rewrite(
      [
        'function _init()',
        '  input.declare({ a = "Jump", ["x"] = \'Shoot\', pause = "Menu" })',
        '  print("ready")',
        'end',
      ].join('\n'),
    );

    expect(text).toBe(['function _init()', '  print("ready")', 'end'].join('\n'));
    expect(declared).toEqual([
      { action: 'a', label: 'Jump' },
      { action: 'x', label: 'Shoot' },
      { action: 'pause', label: 'Menu' },
    ]);
    expect(report.warnings).toEqual([]);
  });

  it('takes the table-call form, drops a key that is not an action and keeps the rest of the line', () => {
    const { text, declared, report } = rewrite(
      'if true then input.declare{ left = "Port", jump = "Up" } end\nprint(1)',
    );

    expect(text).toBe('if true then  end\nprint(1)');
    expect(declared).toEqual([{ action: 'left', label: 'Port' }]);
    expect(report.warnings).toEqual([
      {
        step: 'code',
        file: 'main',
        line: 1,
        message: 'input.declare: "jump" is not an action; dropped',
      },
    ]);
  });

  it('leaves a declare it cannot read and names the file', () => {
    const source =
      'local names = { a = "Jump" }\ninput.declare(names)\ninput.declare{ a = JUMP }\n';

    const { text, declared, report } = rewrite(source);

    expect(text).toBe(source);
    expect(declared).toEqual([]);
    expect(report.warnings.map((w) => [w.file, w.line])).toEqual([
      ['main', 2],
      ['main', 3],
    ]);
    expect(report.warnings[0]?.message).toContain('GAME tab');
  });

  it('leaves a declare used as a value, which cutting would leave a hole in', () => {
    const source = 'local r = input.declare{ a = "Jump" }\n';

    const { text, declared, report } = rewrite(source);

    expect(text).toBe(source);
    expect(declared).toEqual([]);
    expect(report.warnings).toHaveLength(1);
  });

  it('warns about the row effects the beam replaced, with their line', () => {
    const { text, report } = rewrite(
      [
        'gfx.scanline(3, { shift_x = 1 })',
        'gfx.scanline_range(0, 10, fx)',
        'gfx.scanline_fn(function(y) end)',
        'gfx.reset_scanlines()',
        'gfx.persist_effects(true)',
        'gfx.set_palette_row(1, colours)',
        'gfx.screen_col(1, 2, 5)',
        'gfx.screen_col(1, 2)',
      ].join('\n'),
    );

    expect(report.warnings.map((w) => w.line)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(report.warnings.map((w) => w.message.split(' ')[0])).toEqual([
      'gfx.scanline',
      'gfx.scanline_range',
      'gfx.scanline_fn',
      'gfx.reset_scanlines',
      'gfx.persist_effects',
      'gfx.set_palette_row',
      'gfx.screen_col',
    ]);
    expect(text).toContain('gfx.scanline(3');
  });

  /**
   * The first step skips a file this large because parsing it is what costs, and the compat prelude
   * covers what it left. This step reads in one pass and nothing covers what it leaves, so size is
   * no reason to stop.
   */
  it('rewrites a file past 200 KB in full', () => {
    const line = 'if input.btn("left") then x = x - 1 end\n';
    const source = line.repeat(Math.ceil(210_000 / line.length));
    expect(source.length).toBeGreaterThan(200_000);

    const { text, report } = rewrite(source);

    expect(text).not.toContain('input.btn(');
    expect(report.counts['rewrites:main']).toBe(source.split('\n').length - 1);
    expect(report.warnings).toEqual([]);
  });
});
