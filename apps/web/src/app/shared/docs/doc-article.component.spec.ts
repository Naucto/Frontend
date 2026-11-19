import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { DocArticleComponent } from './doc-article.component';
import { type ApiEntry, type DocPage, type DocsIndex, DocsService } from './docs.service';

const fn = (name: string): ApiEntry => ({
  name,
  kind: 'function',
  signature: `${name}()`,
  summary: `What ${name} does.`,
  descriptionHtml: '',
  pictureHtml: '',
  params: [],
  returns: null,
  returnType: null,
  examples: [],
  notes: [],
  since: '',
  seeAlso: [],
});

const card = (name: string): string => `<div class="api-card" data-api="${name}"></div>`;

const article: DocPage = {
  slug: 'api/lua',
  title: 'Lua',
  section: 'api',
  order: 0,
  description: '',
  namespace: 'base',
  lua: null,
  assets: null,
  apis: [],
  headings: [],
  sections: [],
  html: `<p>Walk a table.</p>${card('pairs')}${card('utf8.len')}${card('gfx.clear')}`,
  text: '',
};

const index: DocsIndex = {
  pages: [article],
  manifest: {
    namespaces: [],
    index: { pairs: fn('pairs'), 'utf8.len': fn('utf8.len'), 'gfx.clear': fn('gfx.clear') },
  },
};

describe('DocArticleComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('draws a card for every name the index holds, bare or with a digit in it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(index)))),
    );
    const { fixture } = await render(DocArticleComponent, {
      providers: testProviders(),
      inputs: { page: article },
      detectChangesOnRender: false,
    });
    await TestBed.inject(DocsService).load();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(screen.getByText('What pairs does.')).toBeTruthy();
    expect(screen.getByText('What utf8.len does.')).toBeTruthy();
    expect(screen.getByText('What gfx.clear does.')).toBeTruthy();
  });

  it('copies a block of code as it was written, and says so on the button', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const code =
      '<div class="doc-code"><pre class="lua"><code>' +
      '<span class="doc-line"><span class="tok-kw">local</span> x = 1</span>\n' +
      '<span class="doc-line">x = x + 1</span></code></pre>' +
      '<button type="button" class="doc-copy" aria-label="Copy code"></button></div>';
    await render(DocArticleComponent, {
      providers: testProviders(),
      inputs: { page: { ...article, html: code } },
    });

    const button = screen.getByRole('button', { name: 'Copy code' });
    button.click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('local x = 1\nx = x + 1');
    expect(button.hasAttribute('data-copied')).toBe(true);
  });
});
