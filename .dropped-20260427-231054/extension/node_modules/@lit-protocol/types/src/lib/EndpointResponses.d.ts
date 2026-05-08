import { EcdsaSigType } from '@lit-protocol/constants';
export type SigType = 'BLS' | 'K256' | 'ECDSA_CAIT_SITH' | 'EcdsaCaitSithP256' | 'EcdsaK256Sha256';
export interface EcdsaSignedMessageShareRaw {
    digest: string;
    result: string;
    share_id: string;
    signature_share: string;
    big_r: string;
    compressed_public_key: string;
    public_key: string;
    sig_type: string;
}
/**
 * This is what the /web/pkp/sign endpoint returns
 */
export interface PKPSignEndpointResponse {
    success: boolean;
    signedData: Uint8Array;
    signatureShare: {
        EcdsaSignedMessageShare: EcdsaSignedMessageShareRaw;
    };
}
/**
 * This is the cleaned up version of the EcdsaSignedMessageShareRaw
 *
 * @example
 *   {
 *     "digest": "7d87c5ea75f7378bb701e404c50639161af3eff66293e9f375b5f17eb50476f4",
 *     "shareId": "1A0369823607C6EF403D86BA41534DDB1420730C696060EAD7931DE5DB603937",
 *     "signatureShare": "6F103C0E9632E39CE4BEB3CEE162E2E1E5514CC6D8B5F5700E9B88DDE91A7AB0",
 *     "bigR": "0295635836AED7FDE834F5B835B2D3500070FDF22174A717C91D5375C6EFDDE167",
 *     "compressedPublicKey": "021b922522df1c30b64f0bc53554fd2be50fe75287574f273fd944122c54518c85",
 *     "publicKey": "041b922522df1c30b64f0bc53554fd2be50fe75287574f273fd944122c54518c850768f5eb6e7c9aeef54e07c89df578ace291f58a34bbe32187d60cb12882343a",
 *     "sigType": "EcdsaK256Sha256",
 *     "dataSigned": "7d87c5ea75f7378bb701e404c50639161af3eff66293e9f375b5f17eb50476f4"
 * }
 */
export interface EcdsaSignedMessageShareParsed {
    digest?: string;
    shareId?: string;
    signatureShare: string;
    bigR: string;
    compressedPublicKey?: string;
    publicKey: string;
    sigType: SigType;
    dataSigned: string;
}
export interface LitActionSignedData {
    publicKey: string;
    signatureShare: string;
    sigName: string;
    sigType: EcdsaSigType;
}
