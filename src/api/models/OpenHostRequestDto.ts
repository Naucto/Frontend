/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type OpenHostRequestDto = {
    projectId: number;
    visibility: OpenHostRequestDto.visibility;
};
export namespace OpenHostRequestDto {
    export enum visibility {
        PUBLIC = 'PUBLIC',
        FRIENDS_ONLY = 'FRIENDS_ONLY',
        PRIVATE = 'PRIVATE',
    }
}

