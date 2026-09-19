import { describe, expect, it } from 'vitest';

import { signatureHtml, typeHtml, typeTone } from './type-tone';

describe('typeTone', () => {
  it('gives each toned type its own tone', () => {
    expect(typeTone('number')).toBe('number');
    expect(typeTone('string')).toBe('string');
    expect(typeTone('boolean')).toBe('boolean');
    expect(typeTone('table')).toBe('table');
    expect(typeTone('function')).toBe('function');
    expect(typeTone('any')).toBe('any');
  });

  it('shows nil and anything unknown in the grey of any', () => {
    expect(typeTone('nil')).toBe('any');
    expect(typeTone('userdata')).toBe('any');
    expect(typeTone('')).toBe('any');
  });
});

describe('typeHtml', () => {
  it('wraps a type in a toned span', () => {
    expect(typeHtml('number')).toBe('<span class="nc-type nc-type--number">number</span>');
  });

  it('joins the members of a union with "or", in the order written', () => {
    expect(typeHtml('number|nil')).toBe(
      '<span class="nc-type nc-type--number">number</span> or <span class="nc-type nc-type--any">nil</span>',
    );
    expect(typeHtml('nil|number')).toBe(
      '<span class="nc-type nc-type--any">nil</span> or <span class="nc-type nc-type--number">number</span>',
    );
    expect(typeHtml('string|number')).toBe(
      '<span class="nc-type nc-type--string">string</span> or <span class="nc-type nc-type--number">number</span>',
    );
  });
});

describe('signatureHtml', () => {
  const name = '<span class="api-sig-name">';
  const opt = (s: string): string => `<span class="api-sig-opt">${s}</span>`;
  const arg = (tone: string, s: string): string => `<span class="nc-arg nc-type--${tone}">${s}</span>`;

  it('colours each argument by its documented type and greys the optional marks', () => {
    const html = signatureHtml({
      name: 'gfx.shift',
      signature: 'gfx.shift(dx[, dy][, wrap])',
      params: [
        { name: 'dx', type: 'number' },
        { name: 'dy', type: 'number' },
        { name: 'wrap', type: 'boolean' },
      ],
    });
    expect(html).toBe(
      `${name}gfx.shift</span>(${arg('number', 'dx')}${opt('[')}${opt(',')} ${arg('number', 'dy')}${opt(']')}${opt('[')}${opt(',')} ${arg('boolean', 'wrap')}${opt(']')})`,
    );
  });

  it('handles nested brackets one mark at a time', () => {
    const html = signatureHtml({
      name: 'f',
      signature: 'f(a[, b[, c]])',
      params: [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'table' },
        { name: 'c', type: 'function' },
      ],
    });
    expect(html).toBe(
      `${name}f</span>(${arg('string', 'a')}${opt('[')}${opt(',')} ${arg('table', 'b')}${opt('[')}${opt(',')} ${arg('function', 'c')}${opt(']')}${opt(']')})`,
    );
  });

  it('treats ... as an argument when a parameter is named so', () => {
    const html = signatureHtml({
      name: 'sys.log',
      signature: 'sys.log(...)',
      params: [{ name: '...', type: 'any' }],
    });
    expect(html).toBe(`${name}sys.log</span>(${arg('any', '...')})`);
  });

  it('leaves a token no parameter documents as plain text', () => {
    const html = signatureHtml({
      name: 'gfx.set_color',
      signature: 'gfx.set_color(index, hex | r, g, b)',
      params: [
        { name: 'index', type: 'number' },
        { name: 'hex', type: 'string|number' },
        { name: 'g', type: 'number' },
        { name: 'b', type: 'number' },
      ],
    });
    expect(html).toBe(
      `${name}gfx.set_color</span>(${arg('number', 'index')}${opt(',')} ${arg('string', 'hex')} | r${opt(',')} ${arg('number', 'g')}${opt(',')} ${arg('number', 'b')})`,
    );
  });

  it('shows a value with no parens as its name alone', () => {
    expect(signatureHtml({ name: 'net.state', signature: 'net.state', params: [] })).toBe(
      `${name}net.state</span>`,
    );
  });

  it('escapes markup characters in the text it passes through', () => {
    expect(signatureHtml({ name: 'f', signature: 'f(a <b> & c)', params: [] })).toBe(
      `${name}f</span>(a &lt;b&gt; &amp; c)`,
    );
  });
});
