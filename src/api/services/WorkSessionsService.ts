/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
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
            url: '/work-sessions/{id}',
            path: {
                'id': id,
            },
            errors: {
                400: `Bad request.`,
            },
        });
    }
}
