"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.throwFailedValidation = throwFailedValidation;
exports.applySchemaWithValidation = applySchemaWithValidation;
const zod_validation_error_1 = require("zod-validation-error");
const constants_1 = require("@lit-protocol/constants");
function throwFailedValidation(functionName, params, e) {
    throw new constants_1.InvalidArgumentException({
        info: {
            params,
            function: functionName,
        },
        cause: (0, zod_validation_error_1.isZodErrorLike)(e) ? (0, zod_validation_error_1.fromError)(e) : e,
    }, `Invalid params for ${functionName}. Check error for details.`);
}
function applySchemaWithValidation(functionName, params, schema) {
    try {
        return schema.parse(params);
    }
    catch (e) {
        throwFailedValidation(functionName, params, e);
    }
}
//# sourceMappingURL=validation.js.map