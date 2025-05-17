/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UpdateUserDto } from '../models/UpdateUserDto';
import type { User } from '../models/User';
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
     * @param firstname
     * @param lastname
     * @param page Page number
     * @param limit Items per page
     * @param email Filter by email
     * @param sortBy
     * @param order
     * @param name Filter by name
     * @returns any
     * @throws ApiError
     */
    public static userControllerFindAll(
        firstname: string,
        lastname: string,
        page: number = 1,
        limit: number = 10,
        email?: string,
        sortBy?: 'id' | 'name' | 'email' | 'createdAt',
        order?: 'asc' | 'desc',
        name?: string,
    ): CancelablePromise<{
        statusCode?: number;
        message?: string;
        data?: Array<User>;
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
                'firstname': firstname,
                'lastname': lastname,
                'email': email,
                'sortBy': sortBy,
                'order': order,
                'name': name,
            },
        });
    }
    /**
     * Get a user by ID
     * @param id User ID
     * @returns User Returns the user
     * @throws ApiError
     */
    public static userControllerFindOne(
        id: number,
    ): CancelablePromise<User> {
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
     * @returns User User updated successfully
     * @throws ApiError
     */
    public static userControllerUpdate(
        id: number,
        requestBody: UpdateUserDto,
    ): CancelablePromise<User> {
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
