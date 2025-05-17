/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateUserDto = {
    /**
     * User email address
     */
    email?: string;
    /**
     * User username
     */
    username?: string;
    /**
     * User first name
     */
    firstName?: string;
    /**
     * User last name
     */
    lastName?: string;
    /**
     * User password
     */
    password?: string;
    /**
     * List of Role IDs to assign to the user
     */
    roles?: Array<string>;
};

