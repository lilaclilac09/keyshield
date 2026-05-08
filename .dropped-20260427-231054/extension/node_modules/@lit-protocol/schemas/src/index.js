"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthConfigSchema = void 0;
const tslib_1 = require("tslib");
const schemas_1 = require("./lib/schemas");
const zod_1 = require("zod");
const models_1 = require("./lib/models");
const schemas_2 = require("./lib/schemas");
tslib_1.__exportStar(require("./lib/auth/auth-schemas"), exports);
tslib_1.__exportStar(require("./lib/auth/ScopeSchema"), exports);
tslib_1.__exportStar(require("./lib/encryption"), exports);
tslib_1.__exportStar(require("./lib/models"), exports);
tslib_1.__exportStar(require("./lib/schemas"), exports);
tslib_1.__exportStar(require("./lib/transformers"), exports);
tslib_1.__exportStar(require("./lib/validation"), exports);
tslib_1.__exportStar(require("./lib/naga/naga.schema"), exports);
tslib_1.__exportStar(require("./lib/naga/naga-schema-builder"), exports);
exports.AuthConfigSchema = zod_1.z.preprocess(
// Remove undefined values so Zod defaults can be applied properly
(data) => {
    if (typeof data === 'object' && data !== null) {
        return Object.fromEntries(Object.entries(data).filter(([_, value]) => value !== undefined));
    }
    return data;
}, zod_1.z.object({
    capabilityAuthSigs: zod_1.z.array(schemas_2.AuthSigSchema).optional().default([]),
    expiration: schemas_1.ExpirationSchema.optional().default(new Date(Date.now() + 1000 * 60 * 15).toISOString()),
    statement: zod_1.z.string().optional().default(''),
    domain: schemas_1.DomainSchema.optional().default('localhost'),
    resources: zod_1.z.array(models_1.LitResourceAbilityRequestSchema).optional().default([]),
    keySetIdentifier: zod_1.z.string().optional(),
}));
//# sourceMappingURL=index.js.map