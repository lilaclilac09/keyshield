import { z } from 'zod';
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
export declare const GenericResultBuilder: <T extends z.ZodTypeAny>(dataSchema: T) => z.ZodEffects<z.ZodObject<{
    ok: z.ZodBoolean;
    error: z.ZodNullable<z.ZodString>;
    errorObject: z.ZodNullable<z.ZodAny>;
    data: T;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    ok: z.ZodBoolean;
    error: z.ZodNullable<z.ZodString>;
    errorObject: z.ZodNullable<z.ZodAny>;
    data: T;
}>, any> extends infer T_1 ? { [k in keyof T_1]: z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    ok: z.ZodBoolean;
    error: z.ZodNullable<z.ZodString>;
    errorObject: z.ZodNullable<z.ZodAny>;
    data: T;
}>, any>[k]; } : never, z.baseObjectInputType<{
    ok: z.ZodBoolean;
    error: z.ZodNullable<z.ZodString>;
    errorObject: z.ZodNullable<z.ZodAny>;
    data: T;
}> extends infer T_2 ? { [k_1 in keyof T_2]: z.baseObjectInputType<{
    ok: z.ZodBoolean;
    error: z.ZodNullable<z.ZodString>;
    errorObject: z.ZodNullable<z.ZodAny>;
    data: T;
}>[k_1]; } : never>, (z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    ok: z.ZodBoolean;
    error: z.ZodNullable<z.ZodString>;
    errorObject: z.ZodNullable<z.ZodAny>;
    data: T;
}>, any> extends infer T_3 ? { [k in keyof T_3]: z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    ok: z.ZodBoolean;
    error: z.ZodNullable<z.ZodString>;
    errorObject: z.ZodNullable<z.ZodAny>;
    data: T;
}>, any>[k]; } : never) & {
    parseData: () => z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
        ok: z.ZodBoolean;
        error: z.ZodNullable<z.ZodString>;
        errorObject: z.ZodNullable<z.ZodAny>;
        data: T;
    }>, any>["data"] | undefined;
}, z.baseObjectInputType<{
    ok: z.ZodBoolean;
    error: z.ZodNullable<z.ZodString>;
    errorObject: z.ZodNullable<z.ZodAny>;
    data: T;
}> extends infer T_4 ? { [k_1 in keyof T_4]: z.baseObjectInputType<{
    ok: z.ZodBoolean;
    error: z.ZodNullable<z.ZodString>;
    errorObject: z.ZodNullable<z.ZodAny>;
    data: T;
}>[k_1]; } : never>;
/**
 * Generic result means your schema is wrapped inside:
 *
 * @example
 * {
 *   success: boolean,
 *   values: Array<YOUR_SCHEMA>
 */
export declare const GenericResultSchemaBuilder: <T extends z.ZodTypeAny>(dataSchema: T) => z.ZodObject<{
    success: z.ZodLiteral<true>;
    values: z.ZodArray<T, "many">;
}, "strip", z.ZodTypeAny, {
    values: T["_output"][];
    success: true;
}, {
    values: T["_input"][];
    success: true;
}>;
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
export declare const GenericErrorResultSchemaBuilder: () => z.ZodObject<{
    success: z.ZodLiteral<false>;
    error: z.ZodObject<{
        success: z.ZodOptional<z.ZodBoolean>;
        name: z.ZodOptional<z.ZodString>;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        name?: string | undefined;
        success?: boolean | undefined;
        details?: any;
    }, {
        message: string;
        name?: string | undefined;
        success?: boolean | undefined;
        details?: any;
    }>;
}, "strip", z.ZodTypeAny, {
    error: {
        message: string;
        name?: string | undefined;
        success?: boolean | undefined;
        details?: any;
    };
    success: false;
}, {
    error: {
        message: string;
        name?: string | undefined;
        success?: boolean | undefined;
        details?: any;
    };
    success: false;
}>;
