/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SignedCdnResourceDto } from '../models/SignedCdnResourceDto';
import type { UpdateUserDto } from '../models/UpdateUserDto';
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
     * Upload a user's profile picture
     * @param id User ID
     * @param formData
     * @returns any Profile uploaded
     * @throws ApiError
     */
    public static userControllerUploadProfilePicture(
        id: number,
        formData: {
            /**
             * Profile picture file
             */
            file?: Blob;
        },
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/{id}/profile-picture',
            path: {
                'id': id,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get signed CDN access to a user's profile picture
     * @param id User ID
     * @returns SignedCdnResourceDto Signed cookies and CDN resource URL
     * @throws ApiError
     */
    public static userControllerGetProfilePicture(
        id: number,
    ): CancelablePromise<SignedCdnResourceDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{id}/profile-picture',
            path: {
                'id': id,
            },
            errors: {
                404: `Not found`,
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
