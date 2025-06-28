/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PaginationMetaDto } from './PaginationMetaDto';
import type { UserResponseDto } from './UserResponseDto';
export type UserListResponseDto = {
    /**
     * HTTP status code
     */
    statusCode: number;
    /**
     * Response message
     */
    message: string;
    /**
     * List of users
     */
    data: Array<UserResponseDto>;
    /**
     * Pagination metadata
     */
    meta: PaginationMetaDto;
};

