import { z } from 'zod';
export * from './lib/auth/auth-schemas';
export * from './lib/auth/ScopeSchema';
export * from './lib/encryption';
export * from './lib/models';
export * from './lib/schemas';
export * from './lib/transformers';
export * from './lib/validation';
export * from './lib/naga/naga.schema';
export * from './lib/naga/naga-schema-builder';
export declare const AuthConfigSchema: z.ZodEffects<z.ZodObject<{
    capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
        sig: z.ZodString;
        derivedVia: z.ZodString;
        signedMessage: z.ZodString;
        address: z.ZodString;
        algo: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }, {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }>, "many">>>;
    expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
    statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
    resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
        resource: z.ZodObject<{
            getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
            isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                readonly AccessControlConditionSigning: "access-control-condition-signing";
                readonly PKPSigning: "pkp-signing";
                readonly PaymentDelegation: "lit-payment-delegation";
                readonly LitActionExecution: "lit-action-execution";
            }>], z.ZodUnknown>, z.ZodBoolean>;
            toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
            resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                readonly AccessControlCondition: "lit-accesscontrolcondition";
                readonly PKP: "lit-pkp";
                readonly RLI: "lit-ratelimitincrease";
                readonly PaymentDelegation: "lit-paymentdelegation";
                readonly LitAction: "lit-litaction";
            }>>;
            resource: z.ZodReadonly<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }>;
        ability: z.ZodNativeEnum<{
            readonly AccessControlConditionDecryption: "access-control-condition-decryption";
            readonly AccessControlConditionSigning: "access-control-condition-signing";
            readonly PKPSigning: "pkp-signing";
            readonly PaymentDelegation: "lit-payment-delegation";
            readonly LitActionExecution: "lit-action-execution";
        }>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./lib/schemas").DefinedJson, z.ZodTypeDef, import("./lib/schemas").DefinedJson>>>;
    }, "strip", z.ZodTypeAny, {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./lib/schemas").DefinedJson> | undefined;
    }, {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./lib/schemas").DefinedJson> | undefined;
    }>, "many">>>;
    keySetIdentifier: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    capabilityAuthSigs: {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }[];
    expiration: string;
    statement: string;
    domain: string;
    resources: {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./lib/schemas").DefinedJson> | undefined;
    }[];
    keySetIdentifier?: string | undefined;
}, {
    keySetIdentifier?: string | undefined;
    capabilityAuthSigs?: {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }[] | undefined;
    expiration?: string | undefined;
    statement?: string | undefined;
    domain?: string | undefined;
    resources?: {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./lib/schemas").DefinedJson> | undefined;
    }[] | undefined;
}>, {
    capabilityAuthSigs: {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }[];
    expiration: string;
    statement: string;
    domain: string;
    resources: {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./lib/schemas").DefinedJson> | undefined;
    }[];
    keySetIdentifier?: string | undefined;
}, unknown>;
