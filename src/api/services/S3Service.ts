/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApplyPolicyDto } from '../models/ApplyPolicyDto';
import type { CreateBucketDto } from '../models/CreateBucketDto';
import type { DeleteFilesDto } from '../models/DeleteFilesDto';
import type { GeneratePolicyDto } from '../models/GeneratePolicyDto';
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
     * @param bucketName Name of the bucket
     * @param key Object key
     * @returns any Returns a signed URL for downloading the file
     * @throws ApiError
     */
    public static s3ControllerGetSignedDownloadUrl(
        bucketName: string,
        key: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/s3/download-url/{bucketName}/{key}',
            path: {
                'bucketName': bucketName,
                'key': key,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Download a file directly
     * @param bucketName Name of the bucket
     * @param key Object key
     * @returns any File stream
     * @throws ApiError
     */
    public static s3ControllerDownloadFile(
        bucketName: string,
        key: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/s3/download/{bucketName}/{key}',
            path: {
                'bucketName': bucketName,
                'key': key,
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
     * @param bucketName Name of the bucket
     * @param key Object key
     * @returns any File deleted successfully
     * @throws ApiError
     */
    public static s3ControllerDeleteFile(
        bucketName: string,
        key: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/s3/delete/{bucketName}/{key}',
            path: {
                'bucketName': bucketName,
                'key': key,
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
        requestBody: DeleteFilesDto,
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
     * Delete a bucket
     * @param bucketName Name of the bucket
     * @returns any Bucket deleted successfully
     * @throws ApiError
     */
    public static s3ControllerDeleteBucket(
        bucketName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/s3/bucket/{bucketName}',
            path: {
                'bucketName': bucketName,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Create a new bucket
     * @param bucketName Name of the bucket
     * @param requestBody
     * @returns any Bucket created successfully
     * @throws ApiError
     */
    public static s3ControllerCreateBucket(
        bucketName: string,
        requestBody: CreateBucketDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/s3/bucket/{bucketName}',
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
     * @param bucketName Name of the bucket
     * @param key Object key
     * @returns any Returns object metadata
     * @throws ApiError
     */
    public static s3ControllerGetObjectMetadata(
        bucketName: string,
        key: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/s3/metadata/{bucketName}/{key}',
            path: {
                'bucketName': bucketName,
                'key': key,
            },
            errors: {
                500: `Server error`,
            },
        });
    }
    /**
     * Generate a bucket policy
     * @param bucketName Name of the bucket
     * @param requestBody
     * @returns any Policy generated successfully
     * @throws ApiError
     */
    public static s3ControllerGenerateBucketPolicy(
        bucketName: string,
        requestBody: GeneratePolicyDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/s3/policy/{bucketName}',
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
     * Apply a policy to a bucket
     * @param bucketName Name of the bucket
     * @param requestBody
     * @returns any Policy applied successfully
     * @throws ApiError
     */
    public static s3ControllerApplyBucketPolicy(
        bucketName: string,
        requestBody: ApplyPolicyDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/s3/apply-policy/{bucketName}',
            path: {
                'bucketName': bucketName,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `No policy provided`,
                500: `Server error`,
            },
        });
    }
}
