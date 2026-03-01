/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type LookupHostsResponseDtoHost = {
    sessionUuid: string;
    sessionVisibility: LookupHostsResponseDtoHost.sessionVisibility;
    playerCount: number;
};
export namespace LookupHostsResponseDtoHost {
    export enum sessionVisibility {
        PUBLIC = 'PUBLIC',
        FRIENDS_ONLY = 'FRIENDS_ONLY',
        PRIVATE = 'PRIVATE',
    }
}

