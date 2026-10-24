const PATH_MAX = 200;

/** A page path without its query or fragment, in the characters the server takes for a report. */
export function pagePath(url: string): string {
  const path = (url.split(/[?#]/)[0] ?? '').replace(/[^A-Za-z0-9_\-/.:]/g, '');
  return (path.startsWith('/') ? path : `/${path}`).slice(0, PATH_MAX);
}
