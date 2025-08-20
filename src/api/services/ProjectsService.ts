/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AddCollaboratorDto } from '../models/AddCollaboratorDto';
import type { CreateProjectDto } from '../models/CreateProjectDto';
import type { ProjectResponseDto } from '../models/ProjectResponseDto';
import type { ProjectWithRelationsResponseDto } from '../models/ProjectWithRelationsResponseDto';
import type { RemoveCollaboratorDto } from '../models/RemoveCollaboratorDto';
import type { UpdateProjectDto } from '../models/UpdateProjectDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ProjectsService {
    /**
     * Retrieve the list of projects
     * @returns ProjectWithRelationsResponseDto A JSON array of projects with collaborators and creator information
     * @throws ApiError
     */
    public static projectControllerFindAll(): CancelablePromise<Array<ProjectWithRelationsResponseDto>> {
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
     * @returns ProjectResponseDto Project created successfully
     * @throws ApiError
     */
    public static projectControllerCreate(
        requestBody: CreateProjectDto,
    ): CancelablePromise<ProjectResponseDto> {
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
     * @returns ProjectResponseDto Project object
     * @throws ApiError
     */
    public static projectControllerFindOne(
        id: number,
    ): CancelablePromise<ProjectResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{id}',
            path: {
                'id': id,
            },
            errors: {
                403: `Invalid user or project ID`,
                404: `Project not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Update an existing project
     * @param id Numeric ID of the project to update
     * @param requestBody
     * @returns ProjectResponseDto Updated project object
     * @throws ApiError
     */
    public static projectControllerUpdate(
        id: number,
        requestBody: UpdateProjectDto,
    ): CancelablePromise<ProjectResponseDto> {
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
     * @returns ProjectWithRelationsResponseDto Updated project object with collaborators
     * @throws ApiError
     */
    public static projectControllerAddCollaborator(
        id: number,
        requestBody: AddCollaboratorDto,
    ): CancelablePromise<ProjectWithRelationsResponseDto> {
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
     * @returns ProjectWithRelationsResponseDto Updated project object with collaborators
     * @throws ApiError
     */
    public static projectControllerRemoveCollaborator(
        id: number,
        requestBody: RemoveCollaboratorDto,
    ): CancelablePromise<ProjectWithRelationsResponseDto> {
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
    /**
     * Save project's content
     * @param id
     * @param formData
     * @returns any File uploaded successfully
     * @throws ApiError
     */
    public static projectControllerSaveProjectContent(
        id: string,
        formData: {
            file?: Blob;
        },
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/projects/{id}/saveContent',
            path: {
                'id': id,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                403: `Forbidden`,
            },
        });
    }
    /**
     * Fetch project's content
     * @param id
     * @returns binary File fetched successfully
     * @throws ApiError
     */
    public static projectControllerFetchProjectContent(
        id: string,
    ): CancelablePromise<Blob> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{id}/fetchContent',
            path: {
                'id': id,
            },
            errors: {
                403: `Forbidden`,
                404: `File not found`,
            },
            responseType: "blob"
        });
    }
}
