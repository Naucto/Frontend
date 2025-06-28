/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FetchWorkSessionDto } from '../models/FetchWorkSessionDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class WorkSessionsService {
    /**
     * Join a work session
     * @param id Project ID
     * @returns any The work session has been successfully created.
     * @throws ApiError
     */
    public static workSessionControllerJoin(
        id: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/work-sessions/join/{id}',
            path: {
                'id': id,
            },
            errors: {
                400: `Bad request.`,
            },
        });
    }
    /**
     * Leave a work session
     * @param id Project ID
     * @returns void
     * @throws ApiError
     */
    public static workSessionControllerLeave(
        id: number,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/work-sessions/leave/{id}',
            path: {
                'id': id,
            },
            errors: {
                400: `Bad request.`,
            },
        });
    }
    /**
     * Get work session info
     * @param id Work session ID
     * @returns FetchWorkSessionDto Work session info retrieved successfully.
     * @throws ApiError
     */
    public static workSessionControllerGetInfo(
        id: number,
    ): CancelablePromise<FetchWorkSessionDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/work-sessions/info/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Work session not found.`,
            },
        });
    }
}
