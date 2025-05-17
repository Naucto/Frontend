/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AddCollaboratorDto } from '../models/AddCollaboratorDto';
import type { CreateProjectDto } from '../models/CreateProjectDto';
import type { RemoveCollaboratorDto } from '../models/RemoveCollaboratorDto';
import type { UpdateProjectDto } from '../models/UpdateProjectDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ProjectsService {
    /**
     * Retrieve the list of projects
     * @returns any A JSON array of projects
     * @throws ApiError
     */
    public static projectControllerFindAll(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects',
            errors: {
                500: `Internal server error`,
            },
        });
    }
    /**
     * Create a new project
     * @param requestBody
     * @returns any Project created successfully
     * @throws ApiError
     */
    public static projectControllerCreate(
        requestBody: CreateProjectDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/projects',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request – invalid input`,
            },
        });
    }
    /**
     * Retrieve a single project
     * @param id Numeric ID of the project to retrieve
     * @returns any Project object
     * @throws ApiError
     */
    public static projectControllerFindOne(
        id: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Project not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Update an existing project
     * @param id Numeric ID of the project to update
     * @param requestBody
     * @returns any Updated project object
     * @throws ApiError
     */
    public static projectControllerUpdate(
        id: number,
        requestBody: UpdateProjectDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/projects/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `Project not found`,
                500: `Error updating project`,
            },
        });
    }
    /**
     * Delete a project
     * @param id Numeric ID of the project to delete
     * @returns void
     * @throws ApiError
     */
    public static projectControllerRemove(
        id: number,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/projects/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Project not found`,
                500: `Error deleting project`,
            },
        });
    }
    /**
     * Add a new collaborator
     * @param id Numeric ID of the project to update
     * @param requestBody
     * @returns any Patch project object
     * @throws ApiError
     */
    public static projectControllerAddCollaborator(
        id: number,
        requestBody: AddCollaboratorDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/projects/{id}/add-collaborator',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `Project not found`,
                500: `Error Patching project`,
            },
        });
    }
    /**
     * Remove a collaborator
     * @param id Numeric ID of the project to update
     * @param requestBody
     * @returns any Patch project object
     * @throws ApiError
     */
    public static projectControllerRemoveCollaborator(
        id: number,
        requestBody: RemoveCollaboratorDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/projects/{id}/remove-collaborator',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                404: `Project not found`,
                500: `Error remove collaborator on project`,
            },
        });
    }
}
