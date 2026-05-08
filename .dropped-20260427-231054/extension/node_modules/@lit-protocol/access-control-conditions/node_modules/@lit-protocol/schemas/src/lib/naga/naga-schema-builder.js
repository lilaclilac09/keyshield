"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenericErrorResultSchemaBuilder = exports.GenericResultSchemaBuilder = exports.GenericResultBuilder = void 0;
const zod_1 = require("zod");
/**
 * Generic response means your schema is wrapped inside.
 *
 * eg. handshake response
 *
 * @example
 * {
 *   ok: boolean,
 *   error: string | null,
 *   errorObject: any | null,
 *   data: <YOUR_SCHEMA>
 * }
 */
const GenericResultBuilder = (dataSchema) => {
    const baseSchema = zod_1.z.object({
        ok: zod_1.z.boolean(),
        error: zod_1.z.string().nullable(),
        errorObject: zod_1.z.any().nullable(),
        data: dataSchema,
    });
    return baseSchema.extend({}).transform((parsed) => ({
        ...parsed,
        parseData: () => {
            // Check if the response is successful
            if (!parsed.ok) {
                // If there's an error object, throw that; otherwise throw the error message
                if (parsed.errorObject) {
                    throw parsed.errorObject;
                }
                else if (parsed.error) {
                    throw new Error(parsed.error);
                }
                else {
                    throw new Error('Request failed but no error information provided');
                }
            }
            // Return only the data portion
            return parsed.data;
        },
    }));
};
exports.GenericResultBuilder = GenericResultBuilder;
/**
 * Generic result means your schema is wrapped inside:
 *
 * @example
 * {
 *   success: boolean,
 *   values: Array<YOUR_SCHEMA>
 */
const GenericResultSchemaBuilder = (dataSchema) => {
    return zod_1.z.object({
        success: zod_1.z.literal(true),
        values: zod_1.z.array(dataSchema),
    });
};
exports.GenericResultSchemaBuilder = GenericResultSchemaBuilder;
/**
 * Generic error result means your schema is wrapped inside:
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
const GenericErrorResultSchemaBuilder = () => {
    return zod_1.z.object({
        success: zod_1.z.literal(false),
        error: zod_1.z.object({
            success: zod_1.z.boolean().optional(),
            name: zod_1.z.string().optional(),
            message: zod_1.z.string(),
            details: zod_1.z.any().optional(),
        }),
    });
};
exports.GenericErrorResultSchemaBuilder = GenericErrorResultSchemaBuilder;
//# sourceMappingURL=naga-schema-builder.js.map