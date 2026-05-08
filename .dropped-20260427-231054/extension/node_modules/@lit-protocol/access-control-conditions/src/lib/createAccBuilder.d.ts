/**
 * Access Control Conditions Builder
 *
 * A flexible, type-safe builder for creating access control conditions.
 * Supports all condition types: EVM Basic, EVM Contract, Solana RPC, Cosmos, and Lit Actions.
 *
 * Features:
 * - Convenience methods for common patterns
 * - Escape hatches for custom conditions
 * - Boolean expressions with and/or operators
 * - Grouping support for complex logic
 * - Full TypeScript support
 * - Cosmos flexibility with custom paths and JSONPath keys
 * - Lit Action support with all comparators (=, !=, contains, !contains)
 *
 * Usage:
 * ```typescript
 * import { createAccBuilder } from '@lit-protocol/access-control-conditions';
 *
 * // Simple ETH balance check
 * const simpleCondition = createAccBuilder()
 *   .requireEthBalance('0.001')
 *   .on('ethereum')
 *   .build();
 *
 * // Weather-gated content using Lit Action
 * const weatherGated = createAccBuilder()
 *   .requireLitAction(
 *     'QmWeatherCheckCID',
 *     'checkTemperature',
 *     ['40'],
 *     'true'
 *   )
 *   .on('ethereum')
 *   .build();
 *
 * // Flexible Cosmos condition for KYVE funders
 * const kyveCondition = createAccBuilder()
 *   .requireCosmosCustom(
 *     '/kyve/registry/v1beta1/funders_list/0',
 *     '$.funders.*.account',
 *     ':userAddress',
 *     'contains'
 *   )
 *   .on('kyve')
 *   .build();
 *
 * // Complex boolean expression
 * const complexCondition = createAccBuilder()
 *   .requireEthBalance('0.001').on('ethereum')
 *   .or()
 *   .requireNftOwnership('0x123...', '1').on('polygon')
 *   .or()
 *   .requireCosmosBalance('1000000').on('cosmos')
 *   .or()
 *   .requireLitAction('QmCustomLogic', 'validate', ['param'], 'true').on('ethereum')
 *   .build();
 * ```
 */
import type { AtomAcc, ChainEnumAtom, ChainEnumSol, EvmBasicAcc, EvmChainEnum, EvmContractAcc, OperatorAcc, SolAcc, UnifiedAccessControlCondition } from '@lit-protocol/access-control-conditions-schemas';
import { z } from 'zod';
export type { AtomAcc, EvmBasicAcc, EvmContractAcc, OperatorAcc, SolAcc, UnifiedAccessControlCondition, };
export type AccessControlConditions = UnifiedAccessControlCondition[];
export type EvmChain = z.infer<typeof EvmChainEnum>;
export type SolanaChain = z.infer<typeof ChainEnumSol>;
export type CosmosChain = z.infer<typeof ChainEnumAtom>;
export type SupportedChain = EvmChain | SolanaChain | CosmosChain;
export type Comparator = 'contains' | '=' | '>' | '>=' | '<' | '<=' | '!=' | '!contains';
export type NumericComparator = '>=' | '>' | '=' | '<=' | '<';
export type LitActionComparator = '=' | '!=' | 'contains' | '!contains';
export type StandardContractType = '' | 'ERC20' | 'ERC721' | 'ERC721MetadataName' | 'ERC1155' | 'CASK' | 'Creaton' | 'POAP' | 'timestamp' | 'MolochDAOv2.1' | 'ProofOfHumanity' | 'SIWE' | 'PKPPermissions' | 'LitAction';
export interface AccBuilder {
    requireEthBalance(amount: string, comparator?: NumericComparator): ChainableEvmBuilder;
    requireTokenBalance(contractAddress: string, amount: string, comparator?: NumericComparator): ChainableEvmBuilder;
    requireNftOwnership(contractAddress: string, tokenId?: string): ChainableEvmBuilder;
    requireWalletOwnership(address: string): ChainableEvmBuilder;
    requireTimestamp(timestamp: string, comparator?: NumericComparator): ChainableEvmBuilder;
    requireDAOMembership(daoAddress: string): ChainableEvmBuilder;
    requirePOAPOwnership(eventId: string): ChainableEvmBuilder;
    requireSolBalance(amount: string, comparator?: NumericComparator): ChainableSolBuilder;
    requireSolNftOwnership(collectionAddress: string): ChainableSolBuilder;
    requireSolWalletOwnership(address: string): ChainableSolBuilder;
    requireCosmosBalance(amount: string, comparator?: NumericComparator): ChainableCosmosBuilder;
    requireCosmosWalletOwnership(address: string): ChainableCosmosBuilder;
    requireCosmosCustom(path: string, key: string, value: string, comparator?: Comparator): ChainableCosmosBuilder;
    /**
     * @example
     https://ipfs.io/ipfs/Qme2pfQUV9cuxWmzHrhMKuvTVvKVx87iLiz4AnQnEwS3B6
     
     * @example // Lit Action you can pin this to IPFS and test it
     * const go = async (secretValue) => {
       const VERY_SECURED_PASSWORD = '123456';
       if(secretValue !== VERY_SECURED_PASSWORD){
         return false;
       }
     };
     */
    requireLitAction(ipfsCid: string, method: string, parameters: string[], expectedValue: string, comparator?: LitActionComparator): AccBuilder;
    custom(condition: Partial<AtomAcc | EvmBasicAcc | EvmContractAcc | SolAcc>): AccBuilder;
    unifiedAccs(condition: UnifiedAccessControlCondition): AccBuilder;
    evmBasic(params: Omit<EvmBasicAcc, 'conditionType'>): AccBuilder;
    solRpc(params: Omit<SolAcc, 'conditionType'>): AccBuilder;
    cosmos(params: Omit<AtomAcc, 'conditionType'>): AccBuilder;
    and(): AccBuilder;
    or(): AccBuilder;
    group(builderFn: (builder: AccBuilder) => AccBuilder): AccBuilder;
    build(): AccessControlConditions;
    validate(): {
        valid: boolean;
        errors: string[];
    };
    humanize(): Promise<string>;
}
export interface ChainableEvmBuilder {
    on(chain: EvmChain): AccBuilder;
}
export interface ChainableSolBuilder {
    on(chain: SolanaChain): AccBuilder;
}
export interface ChainableCosmosBuilder {
    on(chain: CosmosChain): AccBuilder;
}
/**
 * Creates a new access control conditions builder
 *
 * @returns {AccBuilder} A new builder instance
 *
 * @example
 * ```typescript
 * const conditions = createAccBuilder()
 *   .requireEthBalance('0.001')
 *   .on('ethereum')
 *   .build();
 * ```
 */
export declare const createAccBuilder: () => AccBuilder;
/**
 * Quick factory for ETH balance requirement
 */
export declare const createEthBalanceCondition: (amount: string, chain: EvmChain, comparator?: NumericComparator) => EvmBasicAcc;
/**
 * Quick factory for token balance requirement
 */
export declare const createTokenBalanceCondition: (contractAddress: string, amount: string, chain: EvmChain, comparator?: NumericComparator) => EvmBasicAcc;
/**
 * Quick factory for NFT ownership requirement
 */
export declare const createNftOwnershipCondition: (contractAddress: string, chain: EvmChain, tokenId?: string) => EvmBasicAcc;
/**
 * Quick factory for wallet ownership requirement
 */
export declare const createWalletOwnershipCondition: (address: string, chain: EvmChain) => EvmBasicAcc;
/**
 * Quick factory for SOL balance requirement
 */
export declare const createSolBalanceCondition: (amount: string, chain: SolanaChain, comparator?: NumericComparator) => SolAcc;
/**
 * Quick factory for Cosmos custom condition
 */
export declare const createCosmosCustomCondition: (path: string, key: string, value: string, chain: CosmosChain, comparator?: Comparator) => AtomAcc;
/**
 * Quick factory for Lit Action condition
 */
export declare const createLitActionCondition: (ipfsCid: string, method: string, parameters: string[], expectedValue: string, comparator?: LitActionComparator) => EvmBasicAcc;
