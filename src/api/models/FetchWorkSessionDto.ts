/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type FetchWorkSessionDto = {
    /**
     * The ID of the users participating in the work session
     */
    users: Array<string>;
    /**
     * The ID of the session's host
     */
    host: number;
    /**
     * The ID of the project this work session belongs to
     */
    project: number;
    /**
     * The date and time when the work session started
     */
    startedAt: string;
    /**
     * The ID of the room for this work session
     */
    roomId: string;
    /**
     * The password for the room of this work session
     */
    roomPassword: string;
};

