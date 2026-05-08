"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.humanizeAccessControlConditions = exports.humanizeUnifiedAccessControlConditions = exports.humanizeCosmosConditions = exports.humanizeSolRpcConditions = exports.humanizeEvmContractConditions = exports.humanizeEvmBasicAccessControlConditions = exports.humanizeComparator = exports.formatAtom = exports.formatSol = exports.decimalPlaces = exports.ERC20ABI = void 0;
const contracts_1 = require("@ethersproject/contracts");
const providers_1 = require("@ethersproject/providers");
const utils_1 = require("ethers/lib/utils");
const constants_1 = require("@lit-protocol/constants");
const logger_1 = require("@lit-protocol/logger");
exports.ERC20ABI = [
    {
        constant: true,
        inputs: [],
        name: 'decimals',
        outputs: [
            {
                name: '',
                type: 'uint8',
            },
        ],
        payable: false,
        stateMutability: 'view',
        type: 'function',
    },
];
/**
 *
 * Get the number of decimal places in a token
 *
 * @property { string } contractAddress The token contract address
 * @property { LitEVMChainKeys } chain The chain on which the token is deployed
 *
 * @returns { number } The number of decimal places in the token
 */
const decimalPlaces = async ({ contractAddress, chain, }) => {
    const rpcUrl = constants_1.LIT_CHAINS[chain].rpcUrls[0];
    const web3 = new providers_1.JsonRpcProvider({
        url: rpcUrl,
        skipFetchSetup: true,
    });
    const contract = new contracts_1.Contract(contractAddress, exports.ERC20ABI, web3);
    return await contract['decimals']();
};
exports.decimalPlaces = decimalPlaces;
/**
 *
 * Format SOL number using Ether Units
 *
 * @param { number } amount
 *
 * @returns { string } formatted unit
 *
 */
const formatSol = (amount) => {
    return (0, utils_1.formatUnits)(amount, 9);
};
exports.formatSol = formatSol;
/**
 *
 * Format Atom number using Ether Units
 *
 * @param { number } amount
 *
 * @returns { string } formatted unit
 *
 */
const formatAtom = (amount) => {
    return (0, utils_1.formatUnits)(amount, 6);
};
exports.formatAtom = formatAtom;
/**
 *
 * Comparator translator
 *
 * @param { string } comparator
 *
 * @returns { string } humanized version of the comparator
 */
const humanizeComparator = (comparator) => {
    const list = {
        '>': 'more than',
        '>=': 'at least',
        '=': 'exactly',
        '<': 'less than',
        '<=': 'at most',
        contains: 'contains',
    };
    const selected = list[comparator];
    if (!selected) {
        logger_1.logger.info(`Unrecognized comparator ${comparator}`);
        return;
    }
    return selected;
};
exports.humanizeComparator = humanizeComparator;
/**
 *
 * Humanize EVM basic access control conditions
 *
 * @property { Array<AccsDefaultParams | any> } accessControlConditions
 * @property { Array<any | string> } tokenList
 * @property { string } myWalletAddress
 *
 * @returns
 */
const humanizeEvmBasicAccessControlConditions = async ({ accessControlConditions, tokenList, myWalletAddress, }) => {
    logger_1.logger.info('humanizing evm basic access control conditions');
    logger_1.logger.info({ msg: 'myWalletAddress', myWalletAddress });
    logger_1.logger.info({ msg: 'accessControlConditions', accessControlConditions });
    let fixedConditions = accessControlConditions;
    // inject and operator if needed
    // this is done because before we supported operators,
    // we let users specify an entire array of conditions
    // that would be "AND"ed together.  this injects those ANDs
    if (accessControlConditions.length > 1) {
        let containsOperator = false;
        for (let i = 0; i < accessControlConditions.length; i++) {
            if ('operator' in accessControlConditions[i]) {
                containsOperator = true;
            }
        }
        if (!containsOperator) {
            fixedConditions = [];
            // insert ANDs between conditions
            for (let i = 0; i < accessControlConditions.length; i++) {
                fixedConditions.push(accessControlConditions[i]);
                if (i < accessControlConditions.length - 1) {
                    fixedConditions.push({
                        operator: 'and',
                    });
                }
            }
        }
    }
    // -- execute
    const promises = await Promise.all(fixedConditions.map(async (acc) => {
        if (Array.isArray(acc)) {
            // this is a group.  recurse.
            const group = await (0, exports.humanizeEvmBasicAccessControlConditions)({
                accessControlConditions: acc,
                tokenList,
                myWalletAddress,
            });
            return `( ${group} )`;
        }
        if (acc.operator) {
            if (acc.operator.toLowerCase() === 'and') {
                return ' and ';
            }
            else if (acc.operator.toLowerCase() === 'or') {
                return ' or ';
            }
        }
        if (acc.standardContractType === 'timestamp' &&
            acc.method === 'eth_getBlockByNumber') {
            return `Latest mined block must be past the unix timestamp ${acc.returnValueTest.value}`;
        }
        else if (acc.standardContractType === 'MolochDAOv2.1' &&
            acc.method === 'members') {
            // molochDAOv2.1 membership
            return `Is a member of the DAO at ${acc.contractAddress}`;
        }
        else if (acc.standardContractType === 'ERC1155' &&
            acc.method === 'balanceOf') {
            // erc1155 owns an amount of specific tokens
            return `Owns ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${acc.returnValueTest.value} of ${acc.contractAddress} tokens with token id ${acc.parameters[1]}`;
        }
        else if (acc.standardContractType === 'ERC1155' &&
            acc.method === 'balanceOfBatch') {
            // erc1155 owns an amount of specific tokens from a batch of token ids
            return `Owns ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${acc.returnValueTest.value} of ${acc.contractAddress} tokens with token id ${acc.parameters[1]
                .split(',')
                .join(' or ')}`;
        }
        else if (acc.standardContractType === 'ERC721' &&
            acc.method === 'ownerOf') {
            // specific erc721
            return `Owner of tokenId ${acc.parameters[0]} from ${acc.contractAddress}`;
        }
        else if (acc.standardContractType === 'ERC721' &&
            acc.method === 'balanceOf' &&
            acc.contractAddress === '0x22C1f6050E56d2876009903609a2cC3fEf83B415' &&
            acc.returnValueTest.comparator === '>' &&
            acc.returnValueTest.value === '0') {
            // for POAP main contract where the user owns at least 1 poap
            return `Owns any POAP`;
        }
        else if (acc.standardContractType === 'POAP' &&
            acc.method === 'tokenURI') {
            // owns a POAP
            return `Owner of a ${acc.returnValueTest.value} POAP on ${acc.chain}`;
        }
        else if (acc.standardContractType === 'POAP' &&
            acc.method === 'eventId') {
            // owns a POAP
            return `Owner of a POAP from event ID ${acc.returnValueTest.value} on ${acc.chain}`;
        }
        else if (acc.standardContractType === 'CASK' &&
            acc.method === 'getActiveSubscriptionCount') {
            // Cask powered subscription
            return `Cask subscriber to provider ${acc.parameters[1]} for plan ${acc.parameters[2]} on ${acc.chain}`;
        }
        else if (acc.standardContractType === 'ERC721' &&
            acc.method === 'balanceOf') {
            // any erc721 in collection
            return `Owns ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${acc.returnValueTest.value} of ${acc.contractAddress} tokens`;
        }
        else if (acc.standardContractType === 'ERC20' &&
            acc.method === 'balanceOf') {
            let tokenFromList;
            if (tokenList) {
                tokenFromList = tokenList.find((t) => t.address === acc.contractAddress);
            }
            let decimals, name;
            if (tokenFromList) {
                decimals = tokenFromList.decimals;
                name = tokenFromList.symbol;
            }
            else {
                try {
                    decimals = await (0, exports.decimalPlaces)({
                        contractAddress: acc.contractAddress,
                        chain: acc.chain,
                    });
                }
                catch (e) {
                    logger_1.logger.info(`Failed to get decimals for ${acc.contractAddress}`); // is this safe to fail and continue?
                }
            }
            logger_1.logger.info({ msg: 'decimals', decimals });
            return `Owns ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${(0, utils_1.formatUnits)(acc.returnValueTest.value, decimals)} of ${name || acc.contractAddress} tokens`;
        }
        else if (acc.standardContractType === '' &&
            acc.method === 'eth_getBalance') {
            return `Owns ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${(0, utils_1.formatEther)(acc.returnValueTest.value)} ETH`;
        }
        else if (acc.standardContractType === '' && acc.method === '') {
            if (myWalletAddress &&
                acc.returnValueTest.value.toLowerCase() ===
                    myWalletAddress.toLowerCase()) {
                return `Controls your wallet (${myWalletAddress})`;
            }
            else {
                return `Controls wallet with address ${acc.returnValueTest.value}`;
            }
        }
        else if (acc.standardContractType === 'LitAction') {
            // Lit Action condition
            const cid = acc.contractAddress.replace('ipfs://', '');
            return `Lit Action ${acc.method}(${acc.parameters.join(', ')}) at ${cid} should return ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${acc.returnValueTest.value}`;
        }
        else if (acc.standardContractType === 'PKPPermissions') {
            // PKP Permissions condition
            return `PKP permissions for ${acc.parameters[0] || 'token'} should ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${acc.returnValueTest.value}`;
        }
        else if (acc.standardContractType === 'SIWE') {
            // Sign-In with Ethereum condition
            return `Valid SIWE signature from ${acc.returnValueTest.value}`;
        }
        else if (acc.standardContractType === 'ProofOfHumanity') {
            // Proof of Humanity verification
            return `Verified human in Proof of Humanity registry at ${acc.contractAddress}`;
        }
        // Fallback for unhandled conditions - provide debugging information
        logger_1.logger.warn({
            standardContractType: acc.standardContractType,
            method: acc.method,
            contractAddress: acc.contractAddress,
            chain: acc.chain,
            conditionType: acc.conditionType,
        }, 'Unhandled access control condition');
        return `Unhandled condition: ${acc.standardContractType || 'unknown'} contract type with method "${acc.method || 'none'}" ${acc.contractAddress ? `at ${acc.contractAddress}` : ''} on ${acc.chain || 'unknown chain'}`;
    }));
    return promises.join('');
};
exports.humanizeEvmBasicAccessControlConditions = humanizeEvmBasicAccessControlConditions;
/**
 *
 * Humanize EVM contract conditions
 *
 * @property { Array<AccsEVMParams> } evmContractConditions
 * @property { Array<any | string> } tokenList
 * @property { string } myWalletAddress
 *
 * @returns { Promise<string> } A promise containing a human readable description of the access control conditions
 *
 */
const humanizeEvmContractConditions = async ({ evmContractConditions, tokenList, myWalletAddress, }) => {
    logger_1.logger.info('humanizing evm contract conditions');
    logger_1.logger.info({ msg: 'myWalletAddress', myWalletAddress });
    logger_1.logger.info({ msg: 'evmContractConditions', evmContractConditions });
    const promises = await Promise.all(evmContractConditions.map(async (acc) => {
        if (Array.isArray(acc)) {
            // this is a group.  recurse.
            const group = await (0, exports.humanizeEvmContractConditions)({
                evmContractConditions: acc,
                tokenList,
                myWalletAddress,
            });
            return `( ${group} )`;
        }
        if (acc.operator) {
            if (acc.operator.toLowerCase() === 'and') {
                return ' and ';
            }
            else if (acc.operator.toLowerCase() === 'or') {
                return ' or ';
            }
        }
        let msg = `${acc.functionName}(${acc.functionParams.join(', ')}) on contract address ${acc.contractAddress} should have a result of ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${acc.returnValueTest.value}`;
        if (acc.returnValueTest.key !== '') {
            msg += ` for key ${acc.returnValueTest.key}`;
        }
        return msg;
    }));
    return promises.join('');
};
exports.humanizeEvmContractConditions = humanizeEvmContractConditions;
/**
 *
 * Humanize SOL RPC Conditions
 *
 * @property { Array<AccsSOLV2Params> } solRpcConditions
 * @property { Array<any | string> } tokenList
 * @property { string } myWalletAddress
 *
 * @returns { Promise<string> } A promise containing a human readable description of the access control conditions
 *
 */
const humanizeSolRpcConditions = async ({ solRpcConditions, tokenList, myWalletAddress, }) => {
    logger_1.logger.info('humanizing sol rpc conditions');
    logger_1.logger.info({ msg: 'myWalletAddress', myWalletAddress });
    logger_1.logger.info({ msg: 'solRpcConditions', solRpcConditions });
    const promises = await Promise.all(solRpcConditions.map(async (acc) => {
        if (Array.isArray(acc)) {
            // this is a group.  recurse.
            const group = await (0, exports.humanizeSolRpcConditions)({
                solRpcConditions: acc,
                tokenList,
                myWalletAddress,
            });
            return `( ${group} )`;
        }
        if (acc.operator) {
            if (acc.operator.toLowerCase() === 'and') {
                return ' and ';
            }
            else if (acc.operator.toLowerCase() === 'or') {
                return ' or ';
            }
        }
        if (acc.method === 'getBalance') {
            return `Owns ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${(0, exports.formatSol)(acc.returnValueTest.value)} SOL`;
        }
        else if (acc.method === '') {
            if (myWalletAddress &&
                acc.returnValueTest.value.toLowerCase() ===
                    myWalletAddress.toLowerCase()) {
                return `Controls your wallet (${myWalletAddress})`;
            }
            else {
                return `Controls wallet with address ${acc.returnValueTest.value}`;
            }
        }
        else {
            let msg = `Solana RPC method ${acc.method}(${acc.params.join(', ')}) should have a result of ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${acc.returnValueTest.value}`;
            if (acc.returnValueTest.key !== '') {
                msg += ` for key ${acc.returnValueTest.key}`;
            }
            return msg;
        }
    }));
    return promises.join('');
};
exports.humanizeSolRpcConditions = humanizeSolRpcConditions;
/**
 *
 * Humanize Cosmos Conditions
 *
 * @property { Array<AccsCOSMOSParams> } cosmosConditions
 * @property { Array<any | string> } tokenList
 * @property { string } myWalletAddress
 *
 * @returns { Promise<string> } A promise containing a human readable description of the access control conditions
 *
 */
const humanizeCosmosConditions = async ({ cosmosConditions, tokenList, myWalletAddress, }) => {
    logger_1.logger.info('humanizing cosmos conditions');
    logger_1.logger.info({ msg: 'myWalletAddress', myWalletAddress });
    logger_1.logger.info({ msg: 'cosmosConditions', cosmosConditions });
    const promises = await Promise.all(cosmosConditions.map(async (acc) => {
        if (Array.isArray(acc)) {
            // this is a group.  recurse.
            const group = await (0, exports.humanizeCosmosConditions)({
                cosmosConditions: acc,
                tokenList,
                myWalletAddress,
            });
            return `( ${group} )`;
        }
        if (acc.operator) {
            if (acc.operator.toLowerCase() === 'and') {
                return ' and ';
            }
            else if (acc.operator.toLowerCase() === 'or') {
                return ' or ';
            }
        }
        if (acc.path === '/cosmos/bank/v1beta1/balances/:userAddress') {
            return `Owns ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${(0, exports.formatAtom)(acc.returnValueTest.value)} ATOM`;
        }
        else if (acc.path === ':userAddress') {
            if (myWalletAddress &&
                acc.returnValueTest.value.toLowerCase() ===
                    myWalletAddress.toLowerCase()) {
                return `Controls your wallet (${myWalletAddress})`;
            }
            else {
                return `Controls wallet with address ${acc.returnValueTest.value}`;
            }
        }
        else if (acc.chain === 'kyve' &&
            acc.path === '/kyve/registry/v1beta1/funders_list/0') {
            return `Is a current KYVE funder`;
        }
        else {
            let msg = `Cosmos RPC request for ${acc.path} should have a result of ${(0, exports.humanizeComparator)(acc.returnValueTest.comparator)} ${acc.returnValueTest.value}`;
            if (acc.returnValueTest.key !== '') {
                msg += ` for key ${acc.returnValueTest.key}`;
            }
            return msg;
        }
    }));
    return promises.join('');
};
exports.humanizeCosmosConditions = humanizeCosmosConditions;
/**
 *
 * Humanize unified access control conditions
 *
 * @property { Array<UnifiedAccessControlConditions> } unifiedAccessControlConditions
 * @property { Array<any | string> } tokenList
 * @property { string } myWalletAddress
 *
 * @returns { Promise<string> } A promise containing a human readable description of the access control conditions
 */
const humanizeUnifiedAccessControlConditions = async ({ unifiedAccessControlConditions, tokenList, myWalletAddress, }) => {
    const promises = await Promise.all(unifiedAccessControlConditions.map(async (acc) => {
        if (Array.isArray(acc)) {
            // this is a group.  recurse.
            const group = await (0, exports.humanizeUnifiedAccessControlConditions)({
                unifiedAccessControlConditions: acc,
                tokenList,
                myWalletAddress,
            });
            return `( ${group} )`;
        }
        if (acc.operator) {
            if (acc.operator.toLowerCase() === 'and') {
                return ' and ';
            }
            else if (acc.operator.toLowerCase() === 'or') {
                return ' or ';
            }
        }
        if (acc.conditionType === 'evmBasic') {
            return (0, exports.humanizeEvmBasicAccessControlConditions)({
                accessControlConditions: [acc],
                tokenList,
                myWalletAddress,
            });
        }
        else if (acc.conditionType === 'evmContract') {
            return (0, exports.humanizeEvmContractConditions)({
                evmContractConditions: [acc],
                tokenList,
                myWalletAddress,
            });
        }
        else if (acc.conditionType === 'solRpc') {
            return (0, exports.humanizeSolRpcConditions)({
                solRpcConditions: [acc],
                tokenList,
                myWalletAddress,
            });
        }
        else if (acc.conditionType === 'cosmos') {
            return (0, exports.humanizeCosmosConditions)({
                cosmosConditions: [acc],
                tokenList,
                myWalletAddress,
            });
        }
        else {
            throw new constants_1.InvalidUnifiedConditionType({
                info: {
                    acc,
                },
            }, 'Unrecognized condition type: %s', acc.conditionType);
        }
    }));
    return promises.join('');
};
exports.humanizeUnifiedAccessControlConditions = humanizeUnifiedAccessControlConditions;
/**
 *
 * The human readable name for an access control condition
 *
 * @param { HumanizedAccsProps } params
 *
 * @returns { Promise<string> } A promise containing a human readable description of the access control conditions
 */
const humanizeAccessControlConditions = async ({ accessControlConditions, evmContractConditions, solRpcConditions, unifiedAccessControlConditions, tokenList, myWalletAddress, }) => {
    // -- check if each condition exists in linear
    if (accessControlConditions) {
        return (0, exports.humanizeEvmBasicAccessControlConditions)({
            accessControlConditions,
            tokenList,
            myWalletAddress,
        });
    }
    else if (evmContractConditions) {
        return (0, exports.humanizeEvmContractConditions)({
            evmContractConditions,
            tokenList,
            myWalletAddress,
        });
    }
    else if (solRpcConditions) {
        return (0, exports.humanizeSolRpcConditions)({
            solRpcConditions,
            tokenList,
            myWalletAddress,
        });
    }
    else if (unifiedAccessControlConditions) {
        return (0, exports.humanizeUnifiedAccessControlConditions)({
            unifiedAccessControlConditions,
            tokenList,
            myWalletAddress,
        });
    }
    // -- undefined
    return;
};
exports.humanizeAccessControlConditions = humanizeAccessControlConditions;
//# sourceMappingURL=humanizer.js.map