"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUnifiedAccessControlConditionsSchema = exports.validateSolRpcConditionsSchema = exports.validateEVMContractConditionsSchema = exports.validateAccessControlConditionsSchema = exports.validateAccessControlConditions = void 0;
const access_control_conditions_schemas_1 = require("@lit-protocol/access-control-conditions-schemas");
const schemas_1 = require("@lit-protocol/schemas");
/**
 * Validates Multiple access control conditions schema
 * @param { MultipleAccessControlConditions } accs
 */
const validateAccessControlConditions = async (accs) => {
    (0, schemas_1.applySchemaWithValidation)('validateAccessControlConditions', accs, access_control_conditions_schemas_1.MultipleAccessControlConditionsSchema);
    return true;
};
exports.validateAccessControlConditions = validateAccessControlConditions;
/**
 * Validates EVM basic access control conditions schema
 * @param { AccessControlConditions } accs
 */
const validateAccessControlConditionsSchema = async (accs) => {
    (0, schemas_1.applySchemaWithValidation)('validateAccessControlConditionsSchema', accs, access_control_conditions_schemas_1.EvmBasicConditionsSchema);
    return true;
};
exports.validateAccessControlConditionsSchema = validateAccessControlConditionsSchema;
/**
 * Validates EVM contract access control conditions schema
 * @param { EvmContractConditions } accs
 */
const validateEVMContractConditionsSchema = async (accs) => {
    (0, schemas_1.applySchemaWithValidation)('validateEVMContractConditionsSchema', accs, access_control_conditions_schemas_1.EvmContractConditionsSchema);
    return true;
};
exports.validateEVMContractConditionsSchema = validateEVMContractConditionsSchema;
/**
 * Validates Sol access control conditions schema
 * @param { SolRpcConditions } accs
 */
const validateSolRpcConditionsSchema = async (accs) => {
    (0, schemas_1.applySchemaWithValidation)('validateSolRpcConditionsSchema', accs, access_control_conditions_schemas_1.SolRpcConditionsSchema);
    return true;
};
exports.validateSolRpcConditionsSchema = validateSolRpcConditionsSchema;
/**
 * Validates unified access control conditions schema
 * @param { UnifiedAccessControlConditions } accs
 */
const validateUnifiedAccessControlConditionsSchema = async (accs) => {
    (0, schemas_1.applySchemaWithValidation)('validateUnifiedAccessControlConditionsSchema', accs, access_control_conditions_schemas_1.UnifiedConditionsSchema);
    return true;
};
exports.validateUnifiedAccessControlConditionsSchema = validateUnifiedAccessControlConditionsSchema;
//# sourceMappingURL=validator.js.map