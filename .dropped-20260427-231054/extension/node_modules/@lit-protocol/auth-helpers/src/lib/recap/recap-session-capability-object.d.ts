import { SiweMessage } from 'siwe';
import { LIT_ABILITY_VALUES } from '@lit-protocol/constants';
import { AttenuationsObject, CID as CIDString, DefinedJson, ILitResource, ISessionCapabilityObject } from '@lit-protocol/types';
export type Restriction = Record<string, DefinedJson>;
export declare class RecapSessionCapabilityObject implements ISessionCapabilityObject {
    private _inner;
    constructor(att?: AttenuationsObject, prf?: CIDString[] | string[]);
    static decode(encoded: string): RecapSessionCapabilityObject;
    static extract(siwe: SiweMessage): RecapSessionCapabilityObject;
    get attenuations(): AttenuationsObject;
    get proofs(): CIDString[];
    get statement(): string;
    addProof(proof: string): void;
    addAttenuation(resource: string, namespace?: string, name?: string, restriction?: Restriction): void;
    addToSiweMessage(siwe: SiweMessage): SiweMessage;
    encodeAsSiweResource(): string;
    /** LIT specific methods */
    addCapabilityForResource(litResource: ILitResource, ability: LIT_ABILITY_VALUES, data?: Restriction): void;
    verifyCapabilitiesForResource(litResource: ILitResource, ability: LIT_ABILITY_VALUES): boolean;
    /**
     * Returns the attenuated resource key to match against. This supports matching
     * against a wildcard resource key too.
     *
     * @example If the attenuations object contains the following:
     *
     * ```
     * {
     *   'lit-acc://*': {
     *    '*\/*': {}
     *   }
     * }
     * ```
     *
     * Then, if the provided litResource is 'lit-acc://123', the method will return 'lit-acc://*'.
     */
    private _getResourceKeyToMatchAgainst;
    addAllCapabilitiesForResource(litResource: ILitResource): void;
}
