/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SignedCdnResourceDto = {
    /**
     * The CDN URL for the resource (requires signed cookies)
     */
    resourceUrl: string;
    /**
     * Signed Edge cookies (also set as HTTP-only cookies)
     */
    cookies: Record<string, any>;
};

