import { describe, expect, it } from 'vitest';

import { ArtStore } from './art/art.store';
import { EDITOR_ROUTES } from './editor.routes';
import { MapStore } from './map/map.store';
import { SoundStore } from './sound/sound.store';

/**
 * Where these are provided *is* the feature: on a tab they die with it, and turning the flag
 * overlay off then coming back turned it on again. Provided on the route that owns every tab they
 * last as long as the project is open. Nothing about the pages themselves says so, which is why
 * moving them back would be silent.
 */
describe('editor routes', () => {
  it('keeps each tab store alive for the whole editing session', () => {
    const parent = EDITOR_ROUTES[0];
    expect(parent?.providers).toEqual(expect.arrayContaining([ArtStore, MapStore, SoundStore]));
    expect(parent?.children?.length).toBeGreaterThan(0);
  });
});
