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
     * Get all released projects
     * @returns ProjectResponseDto A JSON array of projects with collaborators and creator information
     * @throws ApiError
     */
    public static projectControllerGetAllReleases(): CancelablePromise<Array<ProjectResponseDto>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/releases',
        });
    }
    /**
     * Get project release version
     * @param id
     * @returns any Project release file
     * @throws ApiError
     */
    public static projectControllerGetRelease(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/releases/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Get project release version
     * @param id
     * @returns any Project release file
     * @throws ApiError
     */
    public static projectControllerGetReleaseContent(
        id: string,
    ): CancelablePromise<Blob> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/releases/{id}/content',
            path: {
                'id': id,
            },
            responseType: "blob"
        });
    }
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
     * @returns ProjectWithRelationsResponseDto Project object
     * @throws ApiError
     */
    public static projectControllerFindOne(
        id: number,
    ): CancelablePromise<ProjectWithRelationsResponseDto> {
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
     * Add a collaborator to a project by providing either userId, username, or email. At least one must be provided.
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
                400: `Bad request - no valid identifier provided`,
                404: `Project or user not found`,
                500: `Error Patching project`,
            },
        });
    }
    /**
     * Remove a collaborator
     * Remove a collaborator from a project by providing either userId, username, or email. At least one must be provided.
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
                400: `Bad request - no valid identifier provided`,
                403: `Forbidden - cannot remove project creator`,
                404: `Project or user not found`,
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
     * @returns any File fetched successfully
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
    /**
     * Save project's checkpoint
     * @param id
     * @param name
     * @param formData
     * @returns any File uploaded successfully
     * @throws ApiError
     */
    public static projectControllerSaveCheckpoint(
        id: string,
        name: string,
        formData: {
            file?: Blob;
        },
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/projects/{id}/saveCheckpoint/{name}',
            path: {
                'id': id,
                'name': name,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                403: `Forbidden`,
            },
        });
    }
    /**
     * Delete project's checkpoint
     * @param id
     * @param name
     * @returns any File deleted successfully
     * @throws ApiError
     */
    public static projectControllerDeleteCheckpoint(
        id: string,
        name: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/projects/{id}/deleteCheckpoint/{name}',
            path: {
                'id': id,
                'name': name,
            },
            errors: {
                403: `Forbidden`,
            },
        });
    }
    /**
     * Publish project
     * @param id
     * @returns any Project published successfully
     * @throws ApiError
     */
    public static projectControllerPublish(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/projects/{id}/publish',
            path: {
                'id': id,
            },
            errors: {
                403: `Forbidden`,
            },
        });
    }
    /**
     * Unpublish project
     * @param id
     * @returns any Project unpublished successfully
     * @throws ApiError
     */
    public static projectControllerUnpublish(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/projects/{id}/unpublish',
            path: {
                'id': id,
            },
            errors: {
                403: `Forbidden`,
            },
        });
    }
    /**
     * Get project versions
     * @param id
     * @returns any Project versions retrieved successfully
     * @throws ApiError
     */
    public static projectControllerGetVersions(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{id}/versions',
            path: {
                'id': id,
            },
            errors: {
                403: `Forbidden`,
            },
        });
    }
    /**
     * Get project checkpoints
     * @param id
     * @returns any Project checkpoints retrieved successfully
     * @throws ApiError
     */
    public static projectControllerGetCheckpoints(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{id}/checkpoints',
            path: {
                'id': id,
            },
            errors: {
                403: `Forbidden`,
            },
        });
    }
    /**
     * Fetch a project version
     * @param id
     * @param version
     * @returns any Project version retrieved successfully
     * @throws ApiError
     */
    public static projectControllerGetVersion(
        id: string,
        version: string,
    ): CancelablePromise<Blob> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{id}/versions/{version}',
            path: {
                'id': id,
                'version': version,
            },
            errors: {
                403: `Forbidden`,
            },
            responseType: "blob"
        });
    }
    /**
     * Fetch a project checkpoint
     * @param id
     * @param checkpoint
     * @returns any Project checkpoint retrieved successfully
     * @throws ApiError
     */
    public static projectControllerGetCheckpoint(
        id: string,
        checkpoint: string,
    ): CancelablePromise<Blob> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{id}/checkpoints/{checkpoint}',
            path: {
                'id': id,
                'checkpoint': checkpoint,
            },
            errors: {
                403: `Forbidden`,
            },
            responseType: "blob"
        });
    }
}
