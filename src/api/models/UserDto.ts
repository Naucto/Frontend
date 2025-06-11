/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RoleDto } from './RoleDto';
export type UserDto = {
    id: number;
    email: string;
    username: string;
    nickname?: Record<string, any>;
    createdAt: string;
    roles?: Array<RoleDto>;
};

