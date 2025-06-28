/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UserRoleDto } from './UserRoleDto';
export type UserResponseDto = {
    /**
     * User ID
     */
    id: number;
    /**
     * User email address
     */
    email: string;
    /**
     * Username
     */
    username: string;
    /**
     * User nickname
     */
    nickname: Record<string, any> | null;
    /**
     * User roles
     */
    roles?: Array<UserRoleDto>;
    /**
     * User creation date
     */
    createdAt: string;
    /**
     * User last update date
     */
    updatedAt: string;
};

