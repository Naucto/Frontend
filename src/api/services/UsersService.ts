/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UpdateUserDto } from '../models/UpdateUserDto';
import type { UpdateUserProfileDto } from '../models/UpdateUserProfileDto';
import type { UserListResponseDto } from '../models/UserListResponseDto';
import type { UserProfileResponseDto } from '../models/UserProfileResponseDto';
import type { UserSingleResponseDto } from '../models/UserSingleResponseDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class UsersService {
    /**
     * Get current user profile
     * @returns UserProfileResponseDto Returns the current user profile
     * @throws ApiError
     */
    public static userControllerGetProfile(): CancelablePromise<UserProfileResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/profile',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Update current user profile
     * @param requestBody
     * @returns UserProfileResponseDto User profile updated successfully
     * @throws ApiError
     */
    public static userControllerUpdateProfile(
        requestBody: UpdateUserProfileDto,
    ): CancelablePromise<UserProfileResponseDto> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/users/profile',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get all users with pagination and filtering
     * @param page Page number
     * @param limit Items per page
     * @param nickname Filter by nickname
     * @param email Filter by email
     * @param sortBy Sort by field
     * @param order Sort order
     * @param page Page number
     * @param limit Items per page
     * @param nickname Filter by nickname
     * @param email Filter by email
     * @param sortBy Sort by field
     * @param order Sort order
     * @returns UserListResponseDto Returns paginated list of users
     * @throws ApiError
     */
    public static userControllerFindAll(
        page?: number,
        limit?: number,
        nickname?: string,
        email?: string,
        sortBy?: string,
        order?: string,
    ): CancelablePromise<UserListResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users',
            query: {
                'page': page,
                'limit': limit,
                'nickname': nickname,
                'email': email,
                'sortBy': sortBy,
                'order': order,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get a user by ID
     * @param id User ID
     * @returns UserSingleResponseDto Returns the user
     * @throws ApiError
     */
    public static userControllerFindOne(
        id: number,
    ): CancelablePromise<UserSingleResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            errors: {
                400: `Invalid ID format`,
                401: `Unauthorized`,
                404: `User not found`,
            },
        });
    }
    /**
     * Update a user by ID
     * @param id User ID
     * @param requestBody
     * @returns UserSingleResponseDto User updated successfully
     * @throws ApiError
     */
    public static userControllerUpdate(
        id: number,
        requestBody: UpdateUserDto,
    ): CancelablePromise<UserSingleResponseDto> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid input`,
                401: `Unauthorized`,
                403: `Insufficient permissions`,
                404: `User not found`,
            },
        });
    }
    /**
     * Delete a user by ID
     * @param id User ID
     * @returns any User deleted successfully
     * @throws ApiError
     */
    public static userControllerRemove(
        id: number,
    ): CancelablePromise<{
        statusCode?: number;
        message?: string;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Unauthorized`,
                403: `Insufficient permissions`,
                404: `User not found`,
            },
        });
    }
}
