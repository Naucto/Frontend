/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type GeneratePolicyDto = {
    /**
     * S3 actions to include in the policy
     */
    actions?: Array<string>;
    /**
     * Policy effect (Allow or Deny)
     */
    effect?: string;
    /**
     * AWS principal
     */
    principal?: string;
    /**
     * Object key prefix
     */
    prefix?: string;
};

