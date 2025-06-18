/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UpdateUserDto } from '../models/UpdateUserDto';
import type { UserDto } from '../models/UserDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class UsersService {
    /**
     * @returns any
     * @throws ApiError
     */
    public static userControllerGetProfile(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/profile',
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
     * @returns any
     * @throws ApiError
     */
    public static userControllerFindAll(
        page?: number,
        limit?: number,
        nickname?: string,
        email?: string,
        sortBy?: 'id' | 'name' | 'email' | 'createdAt',
        order?: 'asc' | 'desc',
    ): CancelablePromise<{
        statusCode?: number;
        message?: string;
        data?: Array<UserDto>;
        meta?: {
            page?: number;
            limit?: number;
            total?: number;
            totalPages?: number;
        };
    }> {
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
        });
    }
    /**
     * Get a user by ID
     * @param id User ID
     * @returns UserDto Returns the user
     * @throws ApiError
     */
    public static userControllerFindOne(
        id: number,
    ): CancelablePromise<UserDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            errors: {
                400: `Invalid ID format`,
                404: `User not found`,
            },
        });
    }
    /**
     * Update a user by ID
     * @param id User ID
     * @param requestBody
     * @returns UserDto User updated successfully
     * @throws ApiError
     */
    public static userControllerUpdate(
        id: number,
        requestBody: UpdateUserDto,
    ): CancelablePromise<UserDto> {
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
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            errors: {
                403: `Insufficient permissions`,
                404: `User not found`,
            },
        });
    }
}
