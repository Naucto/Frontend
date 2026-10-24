declare const NC_RELEASE: string | undefined;

/**
 * The build of the web app: its version and the commit it was built from, set by
 * `tools/build-web.ts`. A development server has none and says `dev`.
 */
export const APP_RELEASE: string = typeof NC_RELEASE === 'string' ? NC_RELEASE : 'dev';
