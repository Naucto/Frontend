import { type DocPage } from './docs.service';

/**
 * What the new-game page and the editor read once, to make a tutorial's game the reader's own:
 * its code, what its sheet and map hold, and a name.
 */
export function seedNewGame(p: DocPage): void {
  if (!p.lua) return;
  sessionStorage.setItem('naucto.seed-code', p.lua);
  if (p.assets) sessionStorage.setItem('naucto.seed-assets', JSON.stringify(p.assets));
  else sessionStorage.removeItem('naucto.seed-assets');
  sessionStorage.setItem('naucto.seed-name', p.title.replace(/^Build /, ''));
}
