import { LIT_ENDPOINT_VERSION, PRODUCT_ID_VALUES } from '@lit-protocol/constants';
export interface MaxPricesForNodes {
    nodePrices: {
        url: string;
        prices: bigint[];
    }[];
    userMaxPrice: bigint;
    productId: PRODUCT_ID_VALUES;
    numRequiredNodes?: number;
}
/**
 * Interface for a single request item to be sent to a Lit Protocol node.
 * This structure should match the objects within the '_request' array in createLitClient.ts.
 */
export interface RequestItem<T> {
    fullPath: string;
    data: T;
    requestId: string;
    epoch: number;
    version: string;
}
export type EndpointDefinition = {
    path: string;
    version: (typeof LIT_ENDPOINT_VERSION)[keyof typeof LIT_ENDPOINT_VERSION];
};
export type EndPoint = {
    HANDSHAKE: EndpointDefinition;
    SIGN_SESSION_KEY: EndpointDefinition;
    EXECUTE_JS: EndpointDefinition;
    PKP_SIGN: EndpointDefinition;
    PKP_CLAIM: EndpointDefinition;
    ENCRYPTION_SIGN: EndpointDefinition;
};
/**
 * @deprecateed - TODO: we need to move this into the network module, as this might be different for each network
 */
export type CallbackParams = {
    bootstrapUrls: string[];
    currentEpoch: number;
    version: string;
    requiredAttestation: boolean;
    minimumThreshold: number;
    abortTimeout: number;
    endpoints: EndPoint;
    releaseVerificationConfig?: any;
    networkModule: any;
};
type ExactlyOne<T> = {
    [K in keyof T]: Record<K, T[K]> & Partial<Record<Exclude<keyof T, K>, never>>;
}[keyof T];
export type PkpIdentifierRaw = ExactlyOne<{
    tokenId: string | number | bigint;
    address: string;
    pubkey: string;
}>;
export type RawHandshakeNagaResponse = {
    serverPublicKey: string;
    subnetPublicKey: string;
    networkPublicKey: string;
    networkPublicKeySet: string;
    clientSdkVersion: string;
    hdRootPubkeys: string[];
    attestation?: any;
    latestBlockhash: string;
    nodeVersion: string;
    epoch: number;
    nodeIdentityKey: string;
};
export interface ResolvedHandshakeNagaResponse {
    subnetPubKey: string;
    networkPubKey: string;
    networkPubKeySet: string;
    hdRootPubkeys: string[];
    latestBlockhash: string;
}
export type OrchestrateHandshakeResponse = {
    serverKeys: Record<string, RawHandshakeNagaResponse>;
    connectedNodes: Set<string>;
    coreNodeConfig: ResolvedHandshakeNagaResponse | null;
    threshold: number;
};
export type KeySet = Record<string, {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
}>;
export type NodePrices = {
    url: string;
    prices: bigint[];
}[];
export type NagaJitContext = {
    keySet: KeySet;
    nodePrices: NodePrices;
};
export {};
