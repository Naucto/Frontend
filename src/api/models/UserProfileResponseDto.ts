/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UserRoleDto } from './UserRoleDto';
export type UserProfileResponseDto = {
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
    nickname: string | null;
    /**
     * User description
     */
    description: string | null;
    /**
     * Profile image URL
     */
    profileImageUrl: string | null;
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
    /**
     * User profile message
     */
    message: string;
};

