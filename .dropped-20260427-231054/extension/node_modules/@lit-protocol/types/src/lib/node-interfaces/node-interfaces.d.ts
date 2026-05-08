/**
 * This file serves as a central location for all Lit node endpoints and their request/response interfaces & types.
 */
import { AuthMethod, AuthSig } from '../interfaces';
import { AccessControlConditions, EvmContractConditions, SolRpcConditions, UnifiedAccessControlConditions } from '../types';
export interface JsonPKPClaimKeyRequest {
    authMethod: AuthMethod;
    credentialPublicKey?: string | null;
}
export interface EncryptionSignRequest {
    accessControlConditions?: AccessControlConditions[];
    evmContractConditions?: EvmContractConditions[];
    solRpcConditions?: SolRpcConditions[];
    unifiedAccessControlConditions?: UnifiedAccessControlConditions[];
    chain?: string | null;
    dataToEncryptHash: string;
    authSig: AuthSig;
    epoch: number;
}
