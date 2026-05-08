import { z } from 'zod';
export type CustomAuthData = z.infer<typeof CustomAuthDataSchema>;
export declare const CustomAuthDataSchema: z.ZodObject<{
    authMethodId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    authMethodType: z.ZodBigInt;
}, "strip", z.ZodTypeAny, {
    authMethodType: bigint;
    authMethodId: string;
}, {
    authMethodType: bigint;
    authMethodId: string;
}>;
export declare const AuthDataSchema: z.ZodObject<{
    authMethodId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    authMethodType: z.ZodPipeline<z.ZodNumber, z.ZodNativeEnum<{
        readonly EthWallet: 1;
        readonly LitAction: 2;
        readonly WebAuthn: 3;
        readonly Discord: 4;
        readonly Google: 5;
        readonly GoogleJwt: 6;
        readonly AppleJwt: 8;
        readonly StytchOtp: 9;
        readonly StytchEmailFactorOtp: 10;
        readonly StytchSmsFactorOtp: 11;
        readonly StytchWhatsAppFactorOtp: 12;
        readonly StytchTotpFactorOtp: 13;
    }>>;
    accessToken: z.ZodString;
    publicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
    metadata: z.ZodOptional<z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
    accessToken: string;
    authMethodId: string;
    publicKey?: string | undefined;
    metadata?: any;
}, {
    authMethodType: number;
    accessToken: string;
    authMethodId: string;
    publicKey?: string | undefined;
    metadata?: any;
}>;
export type AuthData = z.output<typeof AuthDataSchema>;
export type AuthDataInput = z.input<typeof AuthDataSchema>;
/**
 * Return Object Schema
 */
export declare const JsonSignSessionKeyRequestForPkpReturnSchema: z.ZodObject<{
    nodeSet: z.ZodArray<z.ZodObject<{
        socketAddress: z.ZodString;
        value: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        socketAddress: string;
    }, {
        value: number;
        socketAddress: string;
    }>, "many">;
    sessionKey: z.ZodEffects<z.ZodString, string, string>;
    authData: z.ZodObject<{
        authMethodId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
        authMethodType: z.ZodPipeline<z.ZodNumber, z.ZodNativeEnum<{
            readonly EthWallet: 1;
            readonly LitAction: 2;
            readonly WebAuthn: 3;
            readonly Discord: 4;
            readonly Google: 5;
            readonly GoogleJwt: 6;
            readonly AppleJwt: 8;
            readonly StytchOtp: 9;
            readonly StytchEmailFactorOtp: 10;
            readonly StytchSmsFactorOtp: 11;
            readonly StytchWhatsAppFactorOtp: 12;
            readonly StytchTotpFactorOtp: 13;
        }>>;
        accessToken: z.ZodString;
        publicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
        metadata: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    }, {
        authMethodType: number;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    }>;
    pkpPublicKey: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    siweMessage: z.ZodString;
    curveType: z.ZodLiteral<"BLS">;
    signingScheme: z.ZodLiteral<"BLS">;
    epoch: z.ZodNumber;
    keySetIdentifier: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    epoch: number;
    nodeSet: {
        value: number;
        socketAddress: string;
    }[];
    pkpPublicKey: string;
    authData: {
        authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    };
    sessionKey: string;
    siweMessage: string;
    curveType: "BLS";
    signingScheme: "BLS";
    keySetIdentifier?: string | undefined;
}, {
    epoch: number;
    nodeSet: {
        value: number;
        socketAddress: string;
    }[];
    pkpPublicKey: string;
    authData: {
        authMethodType: number;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    };
    sessionKey: string;
    siweMessage: string;
    curveType: "BLS";
    signingScheme: "BLS";
    keySetIdentifier?: string | undefined;
}>;
export declare const JsonSignCustomSessionKeyRequestForPkpReturnSchema: z.ZodIntersection<z.ZodObject<{
    nodeSet: z.ZodArray<z.ZodObject<{
        socketAddress: z.ZodString;
        value: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        socketAddress: string;
    }, {
        value: number;
        socketAddress: string;
    }>, "many">;
    sessionKey: z.ZodEffects<z.ZodString, string, string>;
    authData: z.ZodObject<{
        authMethodId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
        authMethodType: z.ZodPipeline<z.ZodNumber, z.ZodNativeEnum<{
            readonly EthWallet: 1;
            readonly LitAction: 2;
            readonly WebAuthn: 3;
            readonly Discord: 4;
            readonly Google: 5;
            readonly GoogleJwt: 6;
            readonly AppleJwt: 8;
            readonly StytchOtp: 9;
            readonly StytchEmailFactorOtp: 10;
            readonly StytchSmsFactorOtp: 11;
            readonly StytchWhatsAppFactorOtp: 12;
            readonly StytchTotpFactorOtp: 13;
        }>>;
        accessToken: z.ZodString;
        publicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
        metadata: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    }, {
        authMethodType: number;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    }>;
    pkpPublicKey: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    siweMessage: z.ZodString;
    curveType: z.ZodLiteral<"BLS">;
    signingScheme: z.ZodLiteral<"BLS">;
    epoch: z.ZodNumber;
    jsParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    keySetIdentifier: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    epoch: number;
    nodeSet: {
        value: number;
        socketAddress: string;
    }[];
    pkpPublicKey: string;
    authData: {
        authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    };
    sessionKey: string;
    siweMessage: string;
    curveType: "BLS";
    signingScheme: "BLS";
    keySetIdentifier?: string | undefined;
    jsParams?: Record<string, any> | undefined;
}, {
    epoch: number;
    nodeSet: {
        value: number;
        socketAddress: string;
    }[];
    pkpPublicKey: string;
    authData: {
        authMethodType: number;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    };
    sessionKey: string;
    siweMessage: string;
    curveType: "BLS";
    signingScheme: "BLS";
    keySetIdentifier?: string | undefined;
    jsParams?: Record<string, any> | undefined;
}>, z.ZodUnion<[z.ZodObject<{
    litActionCode: z.ZodString;
    litActionIpfsId: z.ZodOptional<z.ZodNever>;
}, "strip", z.ZodTypeAny, {
    litActionCode: string;
    litActionIpfsId?: undefined;
}, {
    litActionCode: string;
    litActionIpfsId?: undefined;
}>, z.ZodObject<{
    litActionCode: z.ZodOptional<z.ZodNever>;
    litActionIpfsId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    litActionIpfsId: string;
    litActionCode?: undefined;
}, {
    litActionIpfsId: string;
    litActionCode?: undefined;
}>]>>;
/**
 * Consolidated schema for PKP mint requests.
 * This replaces the duplicated schemas across the codebase.
 * Handles both string and number authMethodType inputs.
 */
export declare const MintPKPRequestSchema: z.ZodEffects<z.ZodObject<{
    authMethodId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    authMethodType: z.ZodPipeline<z.ZodNumber, z.ZodNativeEnum<{
        readonly EthWallet: 1;
        readonly LitAction: 2;
        readonly WebAuthn: 3;
        readonly Discord: 4;
        readonly Google: 5;
        readonly GoogleJwt: 6;
        readonly AppleJwt: 8;
        readonly StytchOtp: 9;
        readonly StytchEmailFactorOtp: 10;
        readonly StytchSmsFactorOtp: 11;
        readonly StytchWhatsAppFactorOtp: 12;
        readonly StytchTotpFactorOtp: 13;
    }>>;
    pubkey: z.ZodDefault<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
    scopes: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodEnum<["no-permissions", "sign-anything", "personal-sign"]>, 0n | 1n | 2n, "no-permissions" | "sign-anything" | "personal-sign">, "many">>>;
}, "strip", z.ZodTypeAny, {
    pubkey: string;
    authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
    authMethodId: string;
    scopes: (0n | 1n | 2n)[];
}, {
    authMethodType: number;
    authMethodId: string;
    pubkey?: string | undefined;
    scopes?: ("no-permissions" | "sign-anything" | "personal-sign")[] | undefined;
}>, {
    pubkey: string;
    authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
    authMethodId: string;
    scopes: (0n | 1n | 2n)[];
}, {
    authMethodType: number;
    authMethodId: string;
    pubkey?: string | undefined;
    scopes?: ("no-permissions" | "sign-anything" | "personal-sign")[] | undefined;
}>;
export type MintPKPRequest = z.input<typeof MintPKPRequestSchema>;
export type MintPKPRequestTransformed = z.output<typeof MintPKPRequestSchema>;
