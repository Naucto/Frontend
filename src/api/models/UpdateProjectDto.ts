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
    longDesc?: string;
    /**
     * URL to the project icon
     */
    iconUrl?: string;
    /**
     * Project status
     */
    status?: UpdateProjectDto.status;
    /**
     * Monetization type
     */
    monetization?: UpdateProjectDto.monetization;
    /**
     * The price of the project
     */
    price?: number;
};
export namespace UpdateProjectDto {
    /**
     * Project status
     */
    export enum status {
        IN_PROGRESS = 'IN_PROGRESS',
        COMPLETED = 'COMPLETED',
        ARCHIVED = 'ARCHIVED',
    }
    /**
     * Monetization type
     */
    export enum monetization {
        NONE = 'NONE',
        ADS = 'ADS',
        PAID = 'PAID',
    }
}

