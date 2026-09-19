import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ApiEntry, type DocPage, type DocsIndex, DocsService } from './docs.service';

const page = (slug: string, title: string, sections: DocPage['sections']): DocPage => ({
  slug,
  title,
  section: 'editors',
  order: 0,
  description: '',
  namespace: null,
  legacySlugs: [],
  lua: null,
  assets: null,
  apis: [],
  headings: [],
  sections,
  html: '',
  text: sections.map((s) => `${s.title} ${s.text}`).join(' '),
});

const fn = (name: string, summary: string): ApiEntry => ({
  name,
  kind: 'function',
  signature: `${name}()`,
  summary,
  descriptionHtml: '',
  pictureHtml: '',
  params: [],
  returns: null,
  examples: [],
  notes: [],
  aliases: [],
  since: '2.0',
  seeAlso: [],
});

const index: DocsIndex = {
  pages: [
    page('editors/map', 'MAP', [
      { id: 'map', title: 'MAP', text: 'The MAP tab lays out levels.' },
      { id: 'grid-and-flags', title: 'Grid and Flags', text: 'The Flags overlay tints tiles.' },
    ]),
    page('concepts/camera', 'Camera', [
      { id: 'camera', title: 'Camera', text: 'Where the screen looks.' },
    ]),
  ],
  manifest: {
    namespaces: [
      {
        namespace: 'gfx',
        title: 'Rendering',
        functions: [
          fn('gfx.camera', 'Move the camera.'),
          fn('gfx.clear', 'Fill the screen; the camera does not apply.'),
        ],
        values: [],
      },
    ],
    index: {},
  },
};

describe('DocsService.search', () => {
  let docs: DocsService;

  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(index)))),
    );
    docs = TestBed.inject(DocsService);
    await docs.load();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('puts the thing named before the things that mention it', () => {
    const titles = docs.search('camera').map((h) => h.title);
    expect(titles).toEqual(['Camera', 'gfx.camera()', 'gfx.clear()']);
  });

  it('answers with the section that matched, and one hit per page', () => {
    const hits = docs.search('flags');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.fragment).toBe('grid-and-flags');
    expect(hits[0]?.subtitle.startsWith('Grid and Flags · ')).toBe(true);
  });
});
