import { z } from 'zod';
export declare function throwFailedValidation(functionName: string, params: unknown, e: unknown): never;
export declare function applySchemaWithValidation<T>(functionName: string, params: T, schema: z.ZodType<T>): T;
