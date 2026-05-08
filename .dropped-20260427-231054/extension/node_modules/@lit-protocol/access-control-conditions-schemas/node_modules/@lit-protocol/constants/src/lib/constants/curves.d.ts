import { z } from 'zod';
/**
 * @example
 * const obj = ['a', 'b', 'c']
 * ObjectMapFromArray(obj) // { a: 'a', b: 'b', c: 'c' }
 */
export declare const ObjectMapFromArray: <T extends readonly string[]>(arr: T) => { [K in T[number]]: K; };
export type EcdsaSigType = 'EcdsaK256Sha256' | 'EcdsaP256Sha256' | 'EcdsaP384Sha384';
export type FrostSigType = 'SchnorrEd25519Sha512' | 'SchnorrK256Sha256' | 'SchnorrP256Sha256' | 'SchnorrP384Sha384' | 'SchnorrRistretto25519Sha512' | 'SchnorrEd448Shake256' | 'SchnorrRedJubjubBlake2b512' | 'SchnorrK256Taproot' | 'SchnorrRedDecaf377Blake2b512' | 'SchnorrkelSubstrate';
export type SigType = /* BlsSigType | */ EcdsaSigType | FrostSigType;
export declare const LIT_FROST_VARIANT_VALUES: readonly ["SchnorrEd25519Sha512", "SchnorrK256Sha256", "SchnorrP256Sha256", "SchnorrP384Sha384", "SchnorrRistretto25519Sha512", "SchnorrEd448Shake256", "SchnorrRedJubjubBlake2b512", "SchnorrK256Taproot", "SchnorrRedDecaf377Blake2b512", "SchnorrkelSubstrate"];
export declare const LIT_FROST_VARIANT: {
    SchnorrEd25519Sha512: "SchnorrEd25519Sha512";
    SchnorrK256Sha256: "SchnorrK256Sha256";
    SchnorrP256Sha256: "SchnorrP256Sha256";
    SchnorrP384Sha384: "SchnorrP384Sha384";
    SchnorrRistretto25519Sha512: "SchnorrRistretto25519Sha512";
    SchnorrEd448Shake256: "SchnorrEd448Shake256";
    SchnorrRedJubjubBlake2b512: "SchnorrRedJubjubBlake2b512";
    SchnorrK256Taproot: "SchnorrK256Taproot";
    SchnorrRedDecaf377Blake2b512: "SchnorrRedDecaf377Blake2b512";
    SchnorrkelSubstrate: "SchnorrkelSubstrate";
};
export declare const LIT_FROST_VARIANT_SCHEMA: z.ZodEnum<["SchnorrEd25519Sha512", "SchnorrK256Sha256", "SchnorrP256Sha256", "SchnorrP384Sha384", "SchnorrRistretto25519Sha512", "SchnorrEd448Shake256", "SchnorrRedJubjubBlake2b512", "SchnorrK256Taproot", "SchnorrRedDecaf377Blake2b512", "SchnorrkelSubstrate"]>;
export type LitFrostVariantType = z.infer<typeof LIT_FROST_VARIANT_SCHEMA>;
export declare const LIT_ECDSA_VARIANT_VALUES: readonly ["EcdsaK256Sha256", "EcdsaP256Sha256", "EcdsaP384Sha384"];
export declare const LIT_ECDSA_VARIANT: {
    EcdsaK256Sha256: "EcdsaK256Sha256";
    EcdsaP256Sha256: "EcdsaP256Sha256";
    EcdsaP384Sha384: "EcdsaP384Sha384";
};
export declare const LIT_ECDSA_VARIANT_SCHEMA: z.ZodEnum<["EcdsaK256Sha256", "EcdsaP256Sha256", "EcdsaP384Sha384"]>;
export type LitEcdsaVariantType = z.infer<typeof LIT_ECDSA_VARIANT_SCHEMA>;
export declare const LIT_CURVE: {
    EcdsaK256Sha256: "EcdsaK256Sha256";
    EcdsaP256Sha256: "EcdsaP256Sha256";
    EcdsaP384Sha384: "EcdsaP384Sha384";
    SchnorrEd25519Sha512: "SchnorrEd25519Sha512";
    SchnorrK256Sha256: "SchnorrK256Sha256";
    SchnorrP256Sha256: "SchnorrP256Sha256";
    SchnorrP384Sha384: "SchnorrP384Sha384";
    SchnorrRistretto25519Sha512: "SchnorrRistretto25519Sha512";
    SchnorrEd448Shake256: "SchnorrEd448Shake256";
    SchnorrRedJubjubBlake2b512: "SchnorrRedJubjubBlake2b512";
    SchnorrK256Taproot: "SchnorrK256Taproot";
    SchnorrRedDecaf377Blake2b512: "SchnorrRedDecaf377Blake2b512";
    SchnorrkelSubstrate: "SchnorrkelSubstrate";
};
export declare const SigningSchemeSchema: z.ZodEnum<["EcdsaK256Sha256" | "EcdsaP256Sha256" | "EcdsaP384Sha384" | "SchnorrEd25519Sha512" | "SchnorrK256Sha256" | "SchnorrP256Sha256" | "SchnorrP384Sha384" | "SchnorrRistretto25519Sha512" | "SchnorrEd448Shake256" | "SchnorrRedJubjubBlake2b512" | "SchnorrK256Taproot" | "SchnorrRedDecaf377Blake2b512" | "SchnorrkelSubstrate", ...("EcdsaK256Sha256" | "EcdsaP256Sha256" | "EcdsaP384Sha384" | "SchnorrEd25519Sha512" | "SchnorrK256Sha256" | "SchnorrP256Sha256" | "SchnorrP384Sha384" | "SchnorrRistretto25519Sha512" | "SchnorrEd448Shake256" | "SchnorrRedJubjubBlake2b512" | "SchnorrK256Taproot" | "SchnorrRedDecaf377Blake2b512" | "SchnorrkelSubstrate")[]]>;
export type LitCurve = z.infer<typeof SigningSchemeSchema>;
export type LIT_CURVE_TYPE = keyof typeof LIT_CURVE;
export type LIT_CURVE_VALUES = (typeof LIT_CURVE)[keyof typeof LIT_CURVE];
export declare const CURVE_GROUPS: readonly ["BLS", "ECDSA", "FROST"];
export declare const CURVE_GROUP_BY_CURVE_TYPE: Record<LIT_CURVE_VALUES, (typeof CURVE_GROUPS)[number]>;
