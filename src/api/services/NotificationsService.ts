/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NotificationTestDto } from '../models/NotificationTestDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class NotificationsService {
    /**
     * Send a test notification to the current user
     * @param requestBody
     * @returns any Notification created and sent
     * @throws ApiError
     */
    public static notificationsControllerSendTestNotification(
        requestBody: NotificationTestDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/notifications/test',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Mark one notification as read
     * @param id
     * @returns any Notification marked as read
     * @throws ApiError
     */
    public static notificationsControllerMarkAsRead(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/notifications/{id}/read',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Mark all current user notifications as read
     * @returns any All notifications marked as read
     * @throws ApiError
     */
    public static notificationsControllerMarkAllAsRead(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/notifications/read-all',
        });
    }
}
