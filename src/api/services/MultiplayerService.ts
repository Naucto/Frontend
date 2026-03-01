/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CloseHostRequestDto } from '../models/CloseHostRequestDto';
import type { JoinHostRequestDto } from '../models/JoinHostRequestDto';
import type { JoinHostResponseDto } from '../models/JoinHostResponseDto';
import type { LeaveHostRequestDto } from '../models/LeaveHostRequestDto';
import type { LookupHostsResponseDto } from '../models/LookupHostsResponseDto';
import type { OpenHostRequestDto } from '../models/OpenHostRequestDto';
import type { OpenHostResponseDto } from '../models/OpenHostResponseDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class MultiplayerService {
    /**
     * List available game hosts/sessions from the user's perspective
     * @returns LookupHostsResponseDto A list of available game hosts is returned.
     * @throws ApiError
     */
    public static multiplayerControllerLookupHosts(): CancelablePromise<LookupHostsResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/multiplayer/list-hosts',
            errors: {
                400: `Bad request (wrong project ID).`,
                500: `Unhandled server error.`,
            },
        });
    }
    /**
     * Open a new game host/session, with the caller being the game host
     * @param requestBody
     * @returns OpenHostResponseDto The game host/session has been successfully opened.
     * @throws ApiError
     */
    public static multiplayerControllerOpenHost(
        requestBody: OpenHostRequestDto,
    ): CancelablePromise<OpenHostResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/multiplayer/open-host',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `The user is already hosting a game session for this project.`,
                404: `The user or project was not found.`,
            },
        });
    }
    /**
     * Close an existing game host/session, with the caller being the game host
     * @param requestBody
     * @returns any The game host/session has been successfully closed.
     * @throws ApiError
     */
    public static multiplayerControllerCloseHost(
        requestBody: CloseHostRequestDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/multiplayer/close-host',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `The user, project, or game session was not found.`,
            },
        });
    }
    /**
     * Join an existing game host/session as a player
     * @param requestBody
     * @returns JoinHostResponseDto Successfully joined the game session.
     * @throws ApiError
     */
    public static multiplayerControllerJoinHost(
        requestBody: JoinHostRequestDto,
    ): CancelablePromise<JoinHostResponseDto> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/multiplayer/join-host',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `User is already in the session or is the host.`,
                404: `Game session or user not found.`,
            },
        });
    }
    /**
     * Leave a game host/session as a player
     * @param requestBody
     * @returns any Successfully left the game session.
     * @throws ApiError
     */
    public static multiplayerControllerLeaveHost(
        requestBody: LeaveHostRequestDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/multiplayer/leave-host',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `User is not part of the session or is the host.`,
                404: `Game session or user not found.`,
            },
        });
    }
}
