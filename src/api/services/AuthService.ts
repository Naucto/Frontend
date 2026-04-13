/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthResponseDto } from '../models/AuthResponseDto';
import type { CreateUserDto } from '../models/CreateUserDto';
import type { LoginDto } from '../models/LoginDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * Authenticate a user and return an access token
     * @param requestBody
     * @returns AuthResponseDto User registered successfully
     * @throws ApiError
     */
    public static authControllerLogin(
        requestBody: LoginDto,
    ): CancelablePromise<AuthResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                403: `Cannot register as an admin`,
                409: `Email or username already in use`,
            },
        });
    }
    /**
     * Register a new user and return an access token
     * @param requestBody
     * @returns AuthResponseDto User registered successfully
     * @throws ApiError
     */
    public static authControllerRegister(
        requestBody: CreateUserDto,
    ): CancelablePromise<AuthResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/register',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                403: `Cannot register as an admin`,
                409: `Email already in use`,
            },
        });
    }
    /**
     * Authenticate with Google OAuth token
     * @param requestBody
     * @returns AuthResponseDto Login successful with Google
     * @throws ApiError
     */
    public static authControllerLoginWithGoogle(
        requestBody: any,
    ): CancelablePromise<AuthResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/google',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid Google token`,
            },
        });
    }
    /**
     * Refresh the access token using refresh token cookie
     * @returns AuthResponseDto Access token refreshed successfully
     * @throws ApiError
     */
    public static authControllerRefresh(): CancelablePromise<AuthResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/refresh',
            errors: {
                401: `Refresh token missing or invalid`,
            },
        });
    }
    /**
     * Remove refresh token cookie
     * @returns any Logout successful
     * @throws ApiError
     */
    public static authControllerLogout(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/logout',
        });
    }
}
