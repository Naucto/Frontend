/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateProjectDto = {
    /**
     * The name of the project
     */
    name: string;
    /**
     * A short description of the project
     */
    shortDesc: string;
    /**
     * A detailed description of the project
     */
    longDesc?: Record<string, any>;
    /**
     * URL to the project icon
     */
    iconUrl?: string;
    /**
     * Project status
     */
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
    /**
     * Monetization type
     */
    monetization?: 'NONE' | 'ADS' | 'PAID';
    /**
     * The price of the project
     */
    price?: number;
};

