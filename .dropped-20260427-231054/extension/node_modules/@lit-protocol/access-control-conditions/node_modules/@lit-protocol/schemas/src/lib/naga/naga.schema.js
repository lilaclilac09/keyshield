"use strict";
// import { EncryptedPayloadVersionedSchema } from '@lit-protocol/schema';
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenericResponseSchema = exports.GenericErrorSchema = exports.GenericEncryptedPayloadSchema = exports.EncryptedVersion1Schema = exports.EncryptedVersion1PayloadSchema = void 0;
const zod_1 = require("zod");
const naga_schema_builder_1 = require("./naga-schema-builder");
/**
 * @example
 * {
 *   verification_key: '0x1234567890abcdef',
 *   random: '0x1234567890abcdef',
 *   created_at: '2021-01-01T00:00:00.000Z',
 *   ciphertext_and_tag: '0x1234567890abcdef',
 * }
 */
exports.EncryptedVersion1PayloadSchema = zod_1.z.object({
    verification_key: zod_1.z.string(),
    random: zod_1.z.string(),
    created_at: zod_1.z.string(),
    ciphertext_and_tag: zod_1.z.string(),
});
/**
 * @example
 * {
 *   V1: {
 *     verification_key: '0x1234567890abcdef',
 *     random: '0x1234567890abcdef',
 *     created_at: '2021-01-01T00:00:00.000Z',
 *     ciphertext_and_tag: '0x1234567890abcdef',
 *   }
 * }
 */
exports.EncryptedVersion1Schema = zod_1.z
    .object({
    V1: exports.EncryptedVersion1PayloadSchema,
})
    .transform((data) => {
    return {
        version: '1',
        payload: data.V1,
    };
});
/**
 * Generic encrypted payload means your schema is wrapped inside:
 *
 * @example
 * {
 *   success: boolean,
 *   error?: string,
 *   values: Array<{
 *     version: "1",
 *     payload: {
 *       verification_key: string,
 *       random: string,
 *       created_at: string,
 *       ciphertext_and_tag: string
 *     }
 *   }>
 * }
 */
exports.GenericEncryptedPayloadSchema = (0, naga_schema_builder_1.GenericResultSchemaBuilder)(zod_1.z.object({
    version: zod_1.z.string(),
    payload: exports.EncryptedVersion1PayloadSchema,
}));
/**
 * Generic error schema means your schema is wrapped inside:
 *
 * @example
 * {
 *   success: boolean,
 *   error: {
 *     name: string,
 *     message: string,
 *     details: any | null,
 *   }
 * }
 */
exports.GenericErrorSchema = (0, naga_schema_builder_1.GenericErrorResultSchemaBuilder)();
/**
 * Either encrypted payload or error schema
 */
exports.GenericResponseSchema = exports.GenericEncryptedPayloadSchema.or(exports.GenericErrorSchema);
//# sourceMappingURL=naga.schema.js.map