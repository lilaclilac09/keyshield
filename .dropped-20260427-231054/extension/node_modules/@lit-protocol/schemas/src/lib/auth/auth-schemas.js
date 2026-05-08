"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MintPKPRequestSchema = exports.JsonSignCustomSessionKeyRequestForPkpReturnSchema = exports.JsonSignSessionKeyRequestForPkpReturnSchema = exports.AuthDataSchema = exports.CustomAuthDataSchema = void 0;
const constants_1 = require("@lit-protocol/constants");
const zod_1 = require("zod");
const schemas_1 = require("../schemas");
const ScopeSchema_1 = require("./ScopeSchema");
exports.CustomAuthDataSchema = zod_1.z.object({
    authMethodId: schemas_1.HexPrefixedSchema,
    authMethodType: zod_1.z.bigint(),
});
exports.AuthDataSchema = zod_1.z.object({
    authMethodId: schemas_1.HexPrefixedSchema,
    authMethodType: zod_1.z.coerce.number().pipe(zod_1.z.nativeEnum(constants_1.AUTH_METHOD_TYPE)),
    accessToken: schemas_1.AuthMethodSchema.shape.accessToken,
    publicKey: schemas_1.HexPrefixedSchema.optional(),
    // any other auth specific data
    // eg. stytch contains user_id
    metadata: zod_1.z.any().optional(),
});
/**
 * Return Object Schema
 */
exports.JsonSignSessionKeyRequestForPkpReturnSchema = zod_1.z.object({
    nodeSet: zod_1.z.array(schemas_1.NodeSetSchema),
    sessionKey: schemas_1.SessionKeyUriSchema,
    authData: exports.AuthDataSchema,
    pkpPublicKey: schemas_1.HexPrefixedSchema,
    siweMessage: zod_1.z.string(),
    curveType: zod_1.z.literal('BLS'),
    signingScheme: zod_1.z.literal('BLS'),
    epoch: zod_1.z.number(),
    keySetIdentifier: zod_1.z.string().optional(),
});
exports.JsonSignCustomSessionKeyRequestForPkpReturnSchema = zod_1.z
    .object({
    nodeSet: zod_1.z.array(schemas_1.NodeSetSchema),
    sessionKey: schemas_1.SessionKeyUriSchema,
    authData: exports.AuthDataSchema,
    pkpPublicKey: schemas_1.HexPrefixedSchema,
    siweMessage: zod_1.z.string(),
    curveType: zod_1.z.literal('BLS'),
    signingScheme: zod_1.z.literal('BLS'),
    epoch: zod_1.z.number(),
    // custom auth params
    jsParams: zod_1.z.record(zod_1.z.any()).optional(),
    keySetIdentifier: zod_1.z.string().optional(),
})
    .and(zod_1.z.union([
    zod_1.z.object({
        litActionCode: zod_1.z.string(),
        litActionIpfsId: zod_1.z.never().optional(),
    }),
    zod_1.z.object({
        litActionCode: zod_1.z.never().optional(),
        litActionIpfsId: zod_1.z.string(),
    }),
]));
/**
 * Consolidated schema for PKP mint requests.
 * This replaces the duplicated schemas across the codebase.
 * Handles both string and number authMethodType inputs.
 */
exports.MintPKPRequestSchema = zod_1.z
    .object({
    authMethodId: schemas_1.HexPrefixedSchema,
    authMethodType: zod_1.z.coerce.number().pipe(zod_1.z.nativeEnum(constants_1.AUTH_METHOD_TYPE)),
    pubkey: schemas_1.HexPrefixedSchema.default('0x'),
    scopes: zod_1.z.array(ScopeSchema_1.ScopeSchemaRaw).optional().default([]),
})
    .refine((data) => {
    // Validate pubkey is present for WebAuthn
    // the default has been set to 0x, so we need to check when
    // webauthn is used the pubkey should NOT be 0x
    if (data.authMethodType === constants_1.AUTH_METHOD_TYPE.WebAuthn) {
        return data.pubkey && data.pubkey !== '0x';
    }
    return true;
}, {
    message: 'pubkey is required for WebAuthn and cannot be 0x',
    path: ['pubkey'],
});
//# sourceMappingURL=auth-schemas.js.map