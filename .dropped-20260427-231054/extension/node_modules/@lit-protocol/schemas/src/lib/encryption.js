"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptRequestSchema = exports.DecryptRequestSchema = exports.EncryptResponseSchema = exports.EncryptionMetadataSchema = exports.DecryptRequestBaseSchema = void 0;
const zod_1 = require("zod");
const access_control_conditions_schemas_1 = require("@lit-protocol/access-control-conditions-schemas");
const schemas_1 = require("./schemas");
const schemas_2 = require("./schemas");
exports.DecryptRequestBaseSchema = access_control_conditions_schemas_1.MultipleAccessControlConditionsSchema.merge(schemas_2.ChainedSchema)
    .merge(schemas_2.PricedSchema.partial())
    .extend({
    authContext: zod_1.z.union([schemas_1.PKPAuthContextSchema, schemas_1.EoaAuthContextSchema]),
    authSig: schemas_2.AuthSigSchema.optional(),
    keySetIdentifier: zod_1.z.string().optional(),
});
// Metadata schema for encryption
exports.EncryptionMetadataSchema = zod_1.z
    .object({
    /**
     * The expected data type for decryption conversion
     * Supported types: 'uint8array', 'string', 'json', 'buffer', 'image', 'video', 'file'
     */
    dataType: zod_1.z
        .enum([
        'uint8array',
        'string',
        'json',
        'buffer',
        'image',
        'video',
        'file',
    ])
        .optional(),
    /**
     * MIME type of the file (for image, video, file types)
     */
    mimeType: zod_1.z.string().optional(),
    /**
     * Original filename (for image, video, file types)
     */
    filename: zod_1.z.string().optional(),
    /**
     * File size in bytes
     */
    size: zod_1.z.number().optional(),
    /**
     * Additional custom metadata
     */
    custom: zod_1.z.record(zod_1.z.any()).optional(),
})
    .optional();
exports.EncryptResponseSchema = zod_1.z.object({
    /**
     * The base64-encoded ciphertext
     */
    ciphertext: zod_1.z.string(),
    /**
     * The hash of the data that was encrypted
     */
    dataToEncryptHash: zod_1.z.string(),
    /**
     * Optional metadata containing information about the encrypted data
     */
    metadata: exports.EncryptionMetadataSchema,
});
exports.DecryptRequestSchema = zod_1.z.union([
    // Option 1: Traditional individual properties
    exports.EncryptResponseSchema.merge(exports.DecryptRequestBaseSchema),
    // Option 2: Encrypted data object + other required properties
    exports.DecryptRequestBaseSchema.extend({
        /**
         * The complete encrypted response object from encryption
         */
        data: exports.EncryptResponseSchema,
    }),
]);
exports.EncryptRequestSchema = access_control_conditions_schemas_1.MultipleAccessControlConditionsSchema.merge(schemas_2.ChainedSchema).extend({
    /**
     * The data to encrypt - can be string, object, or Uint8Array
     */
    dataToEncrypt: zod_1.z.union([
        zod_1.z.string(),
        zod_1.z.record(zod_1.z.any()), // for objects
        zod_1.z.array(zod_1.z.any()), // for arrays
        zod_1.z.instanceof(Uint8Array),
    ]),
    /**
     * Optional metadata containing information about the data to encrypt
     */
    metadata: exports.EncryptionMetadataSchema,
});
//# sourceMappingURL=encryption.js.map