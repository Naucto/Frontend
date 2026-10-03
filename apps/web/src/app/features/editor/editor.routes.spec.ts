import { describe, expect, it } from 'vitest';

import { EDITOR_ROUTES } from './editor.routes';

describe('editor routes', () => {
  /**
   * A route's injector outlives the component it loads, so a store provided there would carry one
   * game's selection and clipboard into the next game opened.
   */
  it('provides no tab store on the route', () => {
    const parent = EDITOR_ROUTES[0];
    expect(parent?.providers).toBeUndefined();
    expect(parent?.children?.length).toBeGreaterThan(0);
  });
});
