/**
 * Length limits for user-supplied project text fields.
 *
 * These mirror the server-side limits enforced by the Backend's project DTOs
 * (`class-validator` `@MaxLength`). Kept in sync to give immediate UX feedback
 * and to stop abusive "infinite" titles/descriptions before they are sent.
 */
export const PROJECT_NAME_MAX_LENGTH = 25;
export const PROJECT_SHORT_DESC_MAX_LENGTH = 50;
export const PROJECT_LONG_DESC_MAX_LENGTH = 300;
