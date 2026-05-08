import { AccessControlConditions, EvmContractConditions, SolRpcConditions, UnifiedAccessControlConditions } from '@lit-protocol/types';
export declare function isTokenOperator(token: unknown): boolean;
export declare function isValidBooleanExpression(expression: AccessControlConditions | EvmContractConditions | SolRpcConditions | UnifiedAccessControlConditions): boolean;
