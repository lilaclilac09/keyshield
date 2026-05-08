import { z } from 'zod';
/**
 * @example
 * {
 *   verification_key: '0x1234567890abcdef',
 *   random: '0x1234567890abcdef',
 *   created_at: '2021-01-01T00:00:00.000Z',
 *   ciphertext_and_tag: '0x1234567890abcdef',
 * }
 */
export declare const EncryptedVersion1PayloadSchema: z.ZodObject<{
    verification_key: z.ZodString;
    random: z.ZodString;
    created_at: z.ZodString;
    ciphertext_and_tag: z.ZodString;
}, "strip", z.ZodTypeAny, {
    verification_key: string;
    random: string;
    created_at: string;
    ciphertext_and_tag: string;
}, {
    verification_key: string;
    random: string;
    created_at: string;
    ciphertext_and_tag: string;
}>;
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
export declare const EncryptedVersion1Schema: z.ZodEffects<z.ZodObject<{
    V1: z.ZodObject<{
        verification_key: z.ZodString;
        random: z.ZodString;
        created_at: z.ZodString;
        ciphertext_and_tag: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        verification_key: string;
        random: string;
        created_at: string;
        ciphertext_and_tag: string;
    }, {
        verification_key: string;
        random: string;
        created_at: string;
        ciphertext_and_tag: string;
    }>;
}, "strip", z.ZodTypeAny, {
    V1: {
        verification_key: string;
        random: string;
        created_at: string;
        ciphertext_and_tag: string;
    };
}, {
    V1: {
        verification_key: string;
        random: string;
        created_at: string;
        ciphertext_and_tag: string;
    };
}>, {
    version: string;
    payload: {
        verification_key: string;
        random: string;
        created_at: string;
        ciphertext_and_tag: string;
    };
}, {
    V1: {
        verification_key: string;
        random: string;
        created_at: string;
        ciphertext_and_tag: string;
    };
}>;
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
export declare const GenericEncryptedPayloadSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    values: z.ZodArray<z.ZodObject<{
        version: z.ZodString;
        payload: z.ZodObject<{
            verification_key: z.ZodString;
            random: z.ZodString;
            created_at: z.ZodString;
            ciphertext_and_tag: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        }, {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        version: string;
        payload: {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        };
    }, {
        version: string;
        payload: {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        };
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    values: {
        version: string;
        payload: {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        };
    }[];
    success: true;
}, {
    values: {
        version: string;
        payload: {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        };
    }[];
    success: true;
}>;
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
export declare const GenericErrorSchema: z.ZodObject<{
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
/**
 * Either encrypted payload or error schema
 */
export declare const GenericResponseSchema: z.ZodUnion<[z.ZodObject<{
    success: z.ZodLiteral<true>;
    values: z.ZodArray<z.ZodObject<{
        version: z.ZodString;
        payload: z.ZodObject<{
            verification_key: z.ZodString;
            random: z.ZodString;
            created_at: z.ZodString;
            ciphertext_and_tag: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        }, {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        version: string;
        payload: {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        };
    }, {
        version: string;
        payload: {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        };
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    values: {
        version: string;
        payload: {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        };
    }[];
    success: true;
}, {
    values: {
        version: string;
        payload: {
            verification_key: string;
            random: string;
            created_at: string;
            ciphertext_and_tag: string;
        };
    }[];
    success: true;
}>, z.ZodObject<{
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
}>]>;
export type GenericResponse = z.infer<typeof GenericResponseSchema>;
