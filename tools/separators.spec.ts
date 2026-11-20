import { describe, expect, it } from 'vitest';

import { separators } from './separators.mjs';

describe('separators', () => {
  it('counts a dot between two things in the catalogue', () => {
    expect(separators('en.json', '{ "a": "{{g}} games · {{f}} friends" }')).toBe(1);
    expect(separators('en.json', '{ "a": "PNG · JPG · GIF" }')).toBe(2);
  });

  it('counts it in template text, in an interpolation and alone in an element', () => {
    expect(separators('x.html', '<span>{{ name }} · {{ plays }}</span>')).toBe(1);
    expect(separators('x.html', '<p [title]="label + \' · \' + key"></p>')).toBe(1);
    expect(separators('x.html', '<span class="text-ink-4">·</span>')).toBe(1);
  });

  it('counts it in the string literals of a script, nested templates included', () => {
    expect(separators('x.ts', "const tail = '· ' + when;")).toBe(1);
    expect(separators('x.ts', 'const line = `${file}${line ? `:${line}` : ""} · ${what}`;')).toBe(
      1,
    );
    expect(separators('x.ts', 'const names = `${shown.join(" · ")} · more`;')).toBe(2);
  });

  it('counts the other spellings and the dots that pass for it', () => {
    expect(separators('x.html', '<span>a &middot; b &#183; c &#xB7; d</span>')).toBe(3);
    expect(separators('x.ts', "const a = 'a \\u00b7 b';")).toBe(1);
    expect(separators('x.css', ".tag + .tag::before { content: '\\b7'; }")).toBe(1);
    expect(separators('x.html', '<span>a • b</span>')).toBe(1);
  });

  it('leaves comments alone', () => {
    expect(separators('x.ts', '// PEN · fill · line\nconst a = 1;')).toBe(0);
    expect(separators('x.ts', '/** "0.6 s · 4.8 KB" */\nconst a = 1;')).toBe(0);
    expect(separators('x.html', '<!-- name · plays -->\n<span>{{ name }}</span>')).toBe(0);
    expect(separators('x.ts', 'const template = `<!-- a · b --><span></span>`;')).toBe(0);
    expect(separators('x.css', '/* a · b */\n.a { color: red; }')).toBe(0);
  });

  it('leaves a dot that separates nothing', () => {
    expect(separators('x.ts', "const empty = '········';")).toBe(0);
    expect(separators('ca.json', '{ "a": "una col·lecció" }')).toBe(0);
  });

  it('reads a string that holds a comment marker as a string', () => {
    expect(separators('x.ts', "const url = 'https://naucto.net'; const a = 'a · b';")).toBe(1);
  });
});
