/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DeleteS3FilesDto } from '../models/DeleteS3FilesDto';
import type { UploadFileDto } from '../models/UploadFileDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class S3Service {
    /**
     * List all S3 buckets
     * @returns any Returns a list of all buckets
     * @throws ApiError
     */
    public static s3ControllerListBuckets(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/s3/list',
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * List objects in a bucket
     * @param bucketName Name of the bucket
     * @returns any Returns a list of objects in the bucket
     * @throws ApiError
     */
    public static s3ControllerListObjects(
        bucketName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/s3/list/{bucketName}',
            path: {
                'bucketName': bucketName,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Generate a signed download URL
     * @param key Object key
     * @param bucketName Name of the bucket
     * @returns any Returns a signed URL for downloading the file
     * @throws ApiError
     */
    public static s3ControllerGetSignedDownloadUrl(
        key: string,
        bucketName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/s3/download-url/{bucketName}/{key}',
            path: {
                'key': key,
                'bucketName': bucketName,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Download a file directly
     * @param key Object key
     * @param bucketName Name of the bucket
     * @returns any File stream
     * @throws ApiError
     */
    public static s3ControllerDownloadFile(
        key: string,
        bucketName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/s3/download/{bucketName}/{key}',
            path: {
                'key': key,
                'bucketName': bucketName,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Upload a file to S3
     * @param bucketName Name of the bucket
     * @param formData
     * @returns any File uploaded successfully
     * @throws ApiError
     */
    public static s3ControllerUploadFile(
        bucketName: string,
        formData: UploadFileDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/s3/upload/{bucketName}',
            path: {
                'bucketName': bucketName,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                400: `No file provided`,
                500: `Server error`,
            },
        });
    }
    /**
     * Delete a file from S3
     * @param key Object key
     * @param bucketName Name of the bucket
     * @returns any File deleted successfully
     * @throws ApiError
     */
    public static s3ControllerDeleteFile(
        key: string,
        bucketName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/s3/delete/{bucketName}/{key}',
            path: {
                'key': key,
                'bucketName': bucketName,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Delete multiple files from S3
     * @param bucketName Name of the bucket
     * @param requestBody
     * @returns any Files deleted successfully
     * @throws ApiError
     */
    public static s3ControllerDeleteFiles(
        bucketName: string,
        requestBody: DeleteS3FilesDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/s3/delete-multiple/{bucketName}',
            path: {
                'bucketName': bucketName,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Get object metadata
     * @param key Object key
     * @param bucketName Name of the bucket
     * @returns any Returns object metadata
     * @throws ApiError
     */
    public static s3ControllerGetObjectMetadata(
        key: string,
        bucketName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/s3/metadata/{bucketName}/{key}',
            path: {
                'key': key,
                'bucketName': bucketName,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Generate CloudFront signed cookies for a resource
     * @param key Object key (relative path in CDN)
     * @returns any Returns signed cookies
     * @throws ApiError
     */
    public static s3ControllerGetSignedCookies(
        key: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/s3/signed-cookies/{key}',
            path: {
                'key': key,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Get the CDN URL for a file
     * @param key Object key
     * @returns any Returns the CDN URL
     * @throws ApiError
     */
    public static s3ControllerGetCdnUrl(
        key: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/s3/cdn-url/{key}',
            path: {
                'key': key,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
}
