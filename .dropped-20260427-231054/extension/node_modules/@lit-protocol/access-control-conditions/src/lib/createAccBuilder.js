"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLitActionCondition = exports.createCosmosCustomCondition = exports.createSolBalanceCondition = exports.createWalletOwnershipCondition = exports.createNftOwnershipCondition = exports.createTokenBalanceCondition = exports.createEthBalanceCondition = exports.createAccBuilder = void 0;
// Internal condition builder class
class AccessControlConditionBuilder {
    conditions = [];
    pendingCondition = null;
    // ========== Convenience Methods - EVM Basic ==========
    requireEthBalance(amount, comparator) {
        this.pendingCondition = {
            conditionType: 'evmBasic',
            contractAddress: '',
            standardContractType: '',
            method: 'eth_getBalance',
            parameters: [':userAddress', 'latest'],
            returnValueTest: {
                comparator: comparator || '>=',
                value: amount,
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    requireTokenBalance(contractAddress, amount, comparator) {
        this.pendingCondition = {
            conditionType: 'evmBasic',
            contractAddress,
            standardContractType: 'ERC20',
            method: 'balanceOf',
            parameters: [':userAddress'],
            returnValueTest: {
                comparator: comparator || '>=',
                value: amount,
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    requireNftOwnership(contractAddress, tokenId) {
        const isERC721 = tokenId !== undefined;
        this.pendingCondition = {
            conditionType: 'evmBasic',
            contractAddress,
            standardContractType: isERC721 ? 'ERC721' : 'ERC1155',
            method: 'balanceOf',
            parameters: isERC721
                ? [':userAddress']
                : [':userAddress', tokenId || '1'],
            returnValueTest: {
                comparator: '>',
                value: '0',
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    requireWalletOwnership(address) {
        this.pendingCondition = {
            conditionType: 'evmBasic',
            contractAddress: '',
            standardContractType: '',
            method: '',
            parameters: [':userAddress'],
            returnValueTest: {
                comparator: '=',
                value: address,
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    requireTimestamp(timestamp, comparator) {
        this.pendingCondition = {
            conditionType: 'evmBasic',
            contractAddress: '',
            standardContractType: 'timestamp',
            method: 'eth_getBlockByNumber',
            parameters: ['latest', 'false'],
            returnValueTest: {
                comparator: comparator || '>=',
                value: timestamp,
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    requireDAOMembership(daoAddress) {
        this.pendingCondition = {
            conditionType: 'evmBasic',
            contractAddress: daoAddress,
            standardContractType: 'MolochDAOv2.1',
            method: 'members',
            parameters: [':userAddress'],
            returnValueTest: {
                comparator: '=',
                value: 'true',
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    requirePOAPOwnership(eventId) {
        this.pendingCondition = {
            conditionType: 'evmBasic',
            contractAddress: '0x22C1f6050E56d2876009903609a2cC3fEf83B415', // POAP contract
            standardContractType: 'POAP',
            method: 'eventId',
            parameters: [],
            returnValueTest: {
                comparator: '=',
                value: eventId,
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    // ========== Convenience Methods - Solana ==========
    requireSolBalance(amount, comparator) {
        this.pendingCondition = {
            conditionType: 'solRpc',
            method: 'getBalance',
            params: [':userAddress'],
            pdaParams: [],
            pdaInterface: { offset: 0, fields: {} },
            pdaKey: '',
            returnValueTest: {
                key: '',
                comparator: comparator || '>=',
                value: amount,
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    requireSolNftOwnership(collectionAddress) {
        this.pendingCondition = {
            conditionType: 'solRpc',
            method: 'balanceOfMetaplexCollection',
            params: [collectionAddress],
            pdaParams: [],
            pdaInterface: { offset: 0, fields: {} },
            pdaKey: '',
            returnValueTest: {
                key: '',
                comparator: '>',
                value: '0',
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    requireSolWalletOwnership(address) {
        this.pendingCondition = {
            conditionType: 'solRpc',
            method: '',
            params: [':userAddress'],
            pdaParams: [],
            pdaInterface: { offset: 0, fields: {} },
            pdaKey: '',
            returnValueTest: {
                key: '',
                comparator: '=',
                value: address,
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    // ========== Convenience Methods - Cosmos ==========
    requireCosmosBalance(amount, comparator) {
        this.pendingCondition = {
            conditionType: 'cosmos',
            path: '/cosmos/bank/v1beta1/balances/:userAddress',
            returnValueTest: {
                key: '$.balances[0].amount',
                comparator: comparator || '>=',
                value: amount,
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    requireCosmosWalletOwnership(address) {
        this.pendingCondition = {
            conditionType: 'cosmos',
            path: ':userAddress',
            returnValueTest: {
                key: '',
                comparator: '=',
                value: address,
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    requireCosmosCustom(path, key, value, comparator) {
        this.pendingCondition = {
            conditionType: 'cosmos',
            path,
            returnValueTest: {
                key,
                comparator: comparator || '=',
                value,
            },
        };
        return {
            on: (chain) => this.setChain(chain),
        };
    }
    // ========== Convenience Methods - Lit Actions ==========
    requireLitAction(ipfsCid, method, parameters, expectedValue, comparator) {
        this.pendingCondition = {
            conditionType: 'evmBasic',
            contractAddress: `ipfs://${ipfsCid}`,
            standardContractType: 'LitAction',
            method,
            parameters,
            returnValueTest: {
                comparator: comparator || '=',
                value: expectedValue,
            },
        };
        // Automatically set chain to 'ethereum' for Lit Actions
        this.setChain('ethereum');
        return this;
    }
    // ========== Custom/Raw Methods ==========
    custom(condition) {
        // Validate that essential fields are present
        if (!condition.conditionType) {
            throw new Error('Custom condition must specify conditionType');
        }
        this.commitPendingCondition();
        this.conditions.push(condition);
        return this;
    }
    unifiedAccs(condition) {
        this.commitPendingCondition();
        this.conditions.push(condition);
        return this;
    }
    evmBasic(params) {
        const p = params;
        // For raw evmBasic, chain must be provided in params
        if (!p.chain) {
            throw new Error('Chain must be specified in params for evmBasic method');
        }
        this.pendingCondition = {
            conditionType: 'evmBasic',
            ...p,
        };
        this.setChain(p.chain);
        return this;
    }
    evmContract(params) {
        const p = params;
        // For raw evmContract, chain must be provided in params
        if (!p.chain) {
            throw new Error('Chain must be specified in params for evmContract method');
        }
        this.pendingCondition = {
            conditionType: 'evmContract',
            ...p,
        };
        this.setChain(p.chain);
        return this;
    }
    solRpc(params) {
        const p = params;
        // For raw solRpc, chain must be provided in params
        if (!p.chain) {
            throw new Error('Chain must be specified in params for solRpc method');
        }
        this.pendingCondition = {
            conditionType: 'solRpc',
            ...p,
        };
        this.setChain(p.chain);
        return this;
    }
    cosmos(params) {
        const p = params;
        // For raw cosmos, chain must be provided in params
        if (!p.chain) {
            throw new Error('Chain must be specified in params for cosmos method');
        }
        this.pendingCondition = {
            conditionType: 'cosmos',
            ...p,
        };
        this.setChain(p.chain);
        return this;
    }
    // ========== Boolean Operations ==========
    and() {
        this.commitPendingCondition();
        this.conditions.push({ operator: 'and' });
        return this;
    }
    or() {
        this.commitPendingCondition();
        this.conditions.push({ operator: 'or' });
        return this;
    }
    // ========== Grouping ==========
    group(builderFn) {
        this.commitPendingCondition();
        const subBuilder = new AccessControlConditionBuilder();
        const result = builderFn(subBuilder);
        // Get the raw conditions without calling build() to avoid canonical formatting issues
        const subConditions = result.conditions || [];
        if (subConditions.length > 0) {
            // Add grouping parentheses if there are multiple conditions
            if (subConditions.length > 1) {
                this.conditions.push({ operator: '(' });
                this.conditions.push(...subConditions);
                this.conditions.push({ operator: ')' });
            }
            else {
                this.conditions.push(...subConditions);
            }
        }
        return this;
    }
    // ========== Build ==========
    build() {
        this.commitPendingCondition();
        if (this.conditions.length === 0) {
            throw new Error('Cannot build empty conditions. Add at least one condition.');
        }
        // Return raw conditions - canonical formatting should happen later in the pipeline
        return [...this.conditions];
    }
    // ========== Utility ==========
    validate() {
        const errors = [];
        try {
            const conditions = this.build();
            // Basic validation
            if (conditions.length === 0) {
                errors.push('No conditions specified');
            }
            // Check for proper operator placement
            for (let i = 0; i < conditions.length; i++) {
                const condition = conditions[i];
                if ('operator' in condition) {
                    if (i === 0 || i === conditions.length - 1) {
                        errors.push(`Operator "${condition.operator}" cannot be at the beginning or end`);
                    }
                }
            }
            // Check for consecutive operators
            for (let i = 0; i < conditions.length - 1; i++) {
                const current = conditions[i];
                const next = conditions[i + 1];
                if ('operator' in current && 'operator' in next) {
                    errors.push('Cannot have consecutive operators');
                }
            }
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : 'Unknown validation error');
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    async humanize() {
        try {
            const { humanizeUnifiedAccessControlConditions } = await Promise.resolve().then(() => __importStar(require('./humanizer')));
            const conditions = this.build();
            return await humanizeUnifiedAccessControlConditions({
                unifiedAccessControlConditions: conditions,
            });
        }
        catch (error) {
            throw new Error(`Failed to humanize conditions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // ========== Internal Helpers ==========
    setChain(chain) {
        if (!this.pendingCondition) {
            throw new Error('No pending condition to set chain on');
        }
        this.pendingCondition.chain = chain;
        this.commitPendingCondition();
        return this;
    }
    commitPendingCondition() {
        if (this.pendingCondition) {
            // Validate that required fields are present
            if (!this.pendingCondition.chain) {
                throw new Error('Chain must be specified using .on() method');
            }
            this.conditions.push(this.pendingCondition);
            this.pendingCondition = null;
        }
    }
}
// ========== Factory Functions ==========
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
const createAccBuilder = () => {
    return new AccessControlConditionBuilder();
};
exports.createAccBuilder = createAccBuilder;
// ========== Quick Factory Functions ==========
/**
 * Quick factory for ETH balance requirement
 */
const createEthBalanceCondition = (amount, chain, comparator = '>=') => ({
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain,
    method: 'eth_getBalance',
    parameters: [':userAddress', 'latest'],
    returnValueTest: {
        comparator,
        value: amount,
    },
});
exports.createEthBalanceCondition = createEthBalanceCondition;
/**
 * Quick factory for token balance requirement
 */
const createTokenBalanceCondition = (contractAddress, amount, chain, comparator = '>=') => ({
    conditionType: 'evmBasic',
    contractAddress,
    standardContractType: 'ERC20',
    chain,
    method: 'balanceOf',
    parameters: [':userAddress'],
    returnValueTest: {
        comparator,
        value: amount,
    },
});
exports.createTokenBalanceCondition = createTokenBalanceCondition;
/**
 * Quick factory for NFT ownership requirement
 */
const createNftOwnershipCondition = (contractAddress, chain, tokenId) => {
    const isERC721 = tokenId !== undefined;
    return {
        conditionType: 'evmBasic',
        contractAddress,
        standardContractType: isERC721 ? 'ERC721' : 'ERC1155',
        chain,
        method: 'balanceOf',
        parameters: isERC721 ? [':userAddress'] : [':userAddress', tokenId || '1'],
        returnValueTest: {
            comparator: '>',
            value: '0',
        },
    };
};
exports.createNftOwnershipCondition = createNftOwnershipCondition;
/**
 * Quick factory for wallet ownership requirement
 */
const createWalletOwnershipCondition = (address, chain) => ({
    conditionType: 'evmBasic',
    contractAddress: '',
    standardContractType: '',
    chain,
    method: '',
    parameters: [':userAddress'],
    returnValueTest: {
        comparator: '=',
        value: address,
    },
});
exports.createWalletOwnershipCondition = createWalletOwnershipCondition;
/**
 * Quick factory for SOL balance requirement
 */
const createSolBalanceCondition = (amount, chain, comparator = '>=') => ({
    conditionType: 'solRpc',
    method: 'getBalance',
    params: [':userAddress'],
    pdaParams: [],
    pdaInterface: { offset: 0, fields: {} },
    pdaKey: '',
    chain,
    returnValueTest: {
        key: '',
        comparator,
        value: amount,
    },
});
exports.createSolBalanceCondition = createSolBalanceCondition;
/**
 * Quick factory for Cosmos custom condition
 */
const createCosmosCustomCondition = (path, key, value, chain, comparator = '=') => ({
    conditionType: 'cosmos',
    path,
    chain,
    returnValueTest: {
        key,
        comparator: comparator,
        value,
    },
});
exports.createCosmosCustomCondition = createCosmosCustomCondition;
/**
 * Quick factory for Lit Action condition
 */
const createLitActionCondition = (ipfsCid, method, parameters, expectedValue, comparator = '=') => ({
    conditionType: 'evmBasic',
    contractAddress: `ipfs://${ipfsCid}`,
    standardContractType: 'LitAction',
    chain: 'ethereum', // Automatically set to ethereum for Lit Actions
    method,
    parameters,
    returnValueTest: {
        comparator: comparator,
        value: expectedValue,
    },
});
exports.createLitActionCondition = createLitActionCondition;
//# sourceMappingURL=createAccBuilder.js.map