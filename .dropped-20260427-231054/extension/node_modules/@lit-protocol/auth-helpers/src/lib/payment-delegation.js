"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYMENT_DELEGATION_SCOPES = exports.createPaymentDelegationAuthSig = void 0;
const ethers_1 = require("ethers");
const constants_1 = require("@lit-protocol/constants");
const generate_auth_sig_1 = require("./generate-auth-sig");
const resources_1 = require("./resources");
const create_siwe_message_1 = require("./siwe/create-siwe-message");
const PAYMENT_DELEGATION_SCOPES = new Set([
    'encryption_sign',
    'lit_action',
    'pkp_sign',
    'sign_session_key',
]);
exports.PAYMENT_DELEGATION_SCOPES = PAYMENT_DELEGATION_SCOPES;
const normalizeDelegateeAddresses = (delegateeAddresses) => {
    return delegateeAddresses.map((address) => {
        if (!address || typeof address !== 'string') {
            throw new constants_1.InvalidArgumentException({ info: { delegateeAddresses } }, 'delegateeAddresses must be a non-empty array of strings');
        }
        const trimmed = address.trim();
        const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
        const checksummed = ethers_1.ethers.utils.getAddress(prefixed);
        return checksummed.toLowerCase().replace(/^0x/, '');
    });
};
const normalizeScopes = (scopes) => {
    if (!Array.isArray(scopes) || scopes.length === 0) {
        throw new constants_1.InvalidArgumentException({ info: { scopes } }, 'scopes must be a non-empty array');
    }
    const normalizedScopes = Array.from(new Set(scopes));
    for (const scope of normalizedScopes) {
        if (!PAYMENT_DELEGATION_SCOPES.has(scope)) {
            throw new constants_1.InvalidArgumentException({ info: { scope } }, `Unsupported payment delegation scope: ${scope}`);
        }
    }
    return normalizedScopes;
};
const normalizeMaxPrice = (maxPrice) => {
    if (maxPrice === null || maxPrice === undefined) {
        throw new constants_1.InvalidArgumentException({ info: { maxPrice } }, 'maxPrice is required');
    }
    if (typeof maxPrice === 'bigint') {
        if (maxPrice < 0n) {
            throw new constants_1.InvalidArgumentException({ info: { maxPrice } }, 'maxPrice must be non-negative');
        }
        return maxPrice.toString(16);
    }
    if (typeof maxPrice === 'number') {
        if (!Number.isFinite(maxPrice) || maxPrice < 0) {
            throw new constants_1.InvalidArgumentException({ info: { maxPrice } }, 'maxPrice must be a finite, non-negative number');
        }
        return BigInt(Math.trunc(maxPrice)).toString(16);
    }
    const trimmed = maxPrice.trim();
    if (trimmed.length === 0) {
        throw new constants_1.InvalidArgumentException({ info: { maxPrice } }, 'maxPrice must not be empty');
    }
    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
        return trimmed.slice(2).toLowerCase();
    }
    if (/^[0-9]+$/.test(trimmed)) {
        return BigInt(trimmed).toString(16);
    }
    if (/^[0-9a-fA-F]+$/.test(trimmed)) {
        return trimmed.toLowerCase();
    }
    throw new constants_1.InvalidArgumentException({ info: { maxPrice } }, 'maxPrice must be a hex or decimal string');
};
const resolveNonce = async (params) => {
    if (params.nonce !== undefined) {
        if (typeof params.nonce !== 'string') {
            throw new constants_1.InvalidArgumentException({ info: { nonce: params.nonce } }, 'nonce must be a string');
        }
        const trimmed = params.nonce.trim();
        if (!trimmed) {
            throw new constants_1.InvalidArgumentException({ info: { nonce: params.nonce } }, 'nonce must not be empty');
        }
        return trimmed;
    }
    if (params.litClient && typeof params.litClient.getContext === 'function') {
        const context = await params.litClient.getContext();
        if (context?.latestBlockhash) {
            return context.latestBlockhash;
        }
        throw new constants_1.InvalidArgumentException({ info: { context } }, 'litClient.getContext() did not return latestBlockhash');
    }
    throw new constants_1.InvalidArgumentException({ info: { nonce: params.nonce, hasLitClient: Boolean(params.litClient) } }, 'nonce is required; provide nonce or litClient');
};
const resolveSignerAddress = async (params) => {
    if (params.signerAddress) {
        const prefixed = params.signerAddress.startsWith('0x')
            ? params.signerAddress
            : `0x${params.signerAddress}`;
        return ethers_1.ethers.utils.getAddress(prefixed);
    }
    if ('getAddress' in params.signer &&
        typeof params.signer.getAddress === 'function') {
        return ethers_1.ethers.utils.getAddress(await params.signer.getAddress());
    }
    if ('address' in params.signer &&
        typeof params.signer.address === 'string') {
        return ethers_1.ethers.utils.getAddress(params.signer.address);
    }
    throw new constants_1.InvalidArgumentException({ info: { signer: params.signer } }, 'signerAddress is required when signer does not expose an address');
};
const createPaymentDelegationAuthSig = async (params) => {
    if (!params.signer) {
        throw new constants_1.InvalidArgumentException({ info: { signer: params.signer } }, 'signer is required');
    }
    if (!params.delegateeAddresses || params.delegateeAddresses.length === 0) {
        throw new constants_1.InvalidArgumentException({ info: { delegateeAddresses: params.delegateeAddresses } }, 'delegateeAddresses must be provided');
    }
    const signerAddress = await resolveSignerAddress(params);
    const delegateeAddresses = normalizeDelegateeAddresses(params.delegateeAddresses);
    const scopes = normalizeScopes(params.scopes);
    const maxPrice = normalizeMaxPrice(params.maxPrice);
    const nonce = await resolveNonce(params);
    const data = {
        delegate_to: delegateeAddresses,
        max_price: maxPrice,
        scopes,
    };
    const siweMessage = await (0, create_siwe_message_1.createSiweMessage)({
        walletAddress: signerAddress,
        nonce,
        expiration: params.expiration,
        domain: params.domain,
        statement: params.statement,
        uri: 'lit:capability:delegation',
        resources: [
            {
                resource: new resources_1.LitPaymentDelegationResource('*'),
                ability: constants_1.LIT_ABILITY.PaymentDelegation,
                data,
            },
        ],
    });
    if (!('getAddress' in params.signer) &&
        'address' in params.signer &&
        typeof params.signer.address === 'string') {
        return (0, generate_auth_sig_1.generateAuthSigWithViem)({
            account: params.signer,
            toSign: siweMessage,
            address: signerAddress,
        });
    }
    return (0, generate_auth_sig_1.generateAuthSig)({
        signer: params.signer,
        toSign: siweMessage,
        address: signerAddress,
    });
};
exports.createPaymentDelegationAuthSig = createPaymentDelegationAuthSig;
//# sourceMappingURL=payment-delegation.js.map