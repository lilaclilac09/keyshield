import { AccessControlConditions, EvmContractConditions, MultipleAccessControlConditions, SolRpcConditions, UnifiedAccessControlConditions } from '@lit-protocol/types';
/**
 * Validates Multiple access control conditions schema
 * @param { MultipleAccessControlConditions } accs
 */
export declare const validateAccessControlConditions: (accs: MultipleAccessControlConditions) => Promise<true>;
/**
 * Validates EVM basic access control conditions schema
 * @param { AccessControlConditions } accs
 */
export declare const validateAccessControlConditionsSchema: (accs: AccessControlConditions) => Promise<true>;
/**
 * Validates EVM contract access control conditions schema
 * @param { EvmContractConditions } accs
 */
export declare const validateEVMContractConditionsSchema: (accs: EvmContractConditions) => Promise<true>;
/**
 * Validates Sol access control conditions schema
 * @param { SolRpcConditions } accs
 */
export declare const validateSolRpcConditionsSchema: (accs: SolRpcConditions) => Promise<true>;
/**
 * Validates unified access control conditions schema
 * @param { UnifiedAccessControlConditions } accs
 */
export declare const validateUnifiedAccessControlConditionsSchema: (accs: UnifiedAccessControlConditions) => Promise<true>;
