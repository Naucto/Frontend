/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ProjectResponseDto = {
    /**
     * The unique identifier of the project
     */
    id: number;
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
    longDesc: Record<string, any> | null;
    /**
     * URL to the project icon
     */
    iconUrl: Record<string, any> | null;
    /**
     * The current status of the project
     */
    status: ProjectResponseDto.status | null;
    /**
     * The monetization strategy for this project
     */
    monetization: ProjectResponseDto.monetization | null;
    /**
     * The price of the project, if applicable
     */
    price: Record<string, any> | null;
    /**
     * The ID of the user who owns this project
     */
    userId: number;
    /**
     * The date and time when the project was created
     */
    createdAt: string;
    /**
     * The number of unique players who have interacted with this project
     */
    uniquePlayers: number;
    /**
     * The number of currently active players in this project
     */
    activePlayers: number;
    /**
     * The number of likes received by the project
     */
    likes: number;
};
export namespace ProjectResponseDto {
    /**
     * The current status of the project
     */
    export enum status {
        IN_PROGRESS = 'IN_PROGRESS',
        COMPLETED = 'COMPLETED',
        ARCHIVED = 'ARCHIVED',
    }
    /**
     * The monetization strategy for this project
     */
    export enum monetization {
        NONE = 'NONE',
        ADS = 'ADS',
        PAID = 'PAID',
    }
}

