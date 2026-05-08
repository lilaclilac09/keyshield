"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScopeSchemaRaw = exports.ScopeStringSchema = exports.SCOPE_MAPPING = exports.SCOPE_VALUES = void 0;
const zod_1 = require("zod");
/**
 * Defines schemas for PKP permission scopes.
 * Handles both string inputs and bigint transformations for contract calls.
 */
// Valid scope values
exports.SCOPE_VALUES = [
    'no-permissions',
    'sign-anything',
    'personal-sign',
];
// Mapping from string scopes to their bigint representation
exports.SCOPE_MAPPING = {
    'no-permissions': 0n,
    'sign-anything': 1n,
    'personal-sign': 2n,
};
// Schema for string values (used in high-level APIs)
exports.ScopeStringSchema = zod_1.z.enum(exports.SCOPE_VALUES);
// Schema that transforms strings to bigints (used in contract calls)
exports.ScopeSchemaRaw = exports.ScopeStringSchema.transform((val) => exports.SCOPE_MAPPING[val]);
//# sourceMappingURL=ScopeSchema.js.map