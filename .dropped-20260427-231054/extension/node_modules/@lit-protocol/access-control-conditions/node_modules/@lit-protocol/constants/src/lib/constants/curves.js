"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURVE_GROUP_BY_CURVE_TYPE = exports.CURVE_GROUPS = exports.SigningSchemeSchema = exports.LIT_CURVE = exports.LIT_ECDSA_VARIANT_SCHEMA = exports.LIT_ECDSA_VARIANT = exports.LIT_ECDSA_VARIANT_VALUES = exports.LIT_FROST_VARIANT_SCHEMA = exports.LIT_FROST_VARIANT = exports.LIT_FROST_VARIANT_VALUES = exports.ObjectMapFromArray = void 0;
const zod_1 = require("zod");
/**
 * @example
 * const obj = ['a', 'b', 'c']
 * ObjectMapFromArray(obj) // { a: 'a', b: 'b', c: 'c' }
 */
const ObjectMapFromArray = (arr) => {
    return arr.reduce((acc, scope) => ({ ...acc, [scope]: scope }), {});
};
exports.ObjectMapFromArray = ObjectMapFromArray;
// ----- Frost Variant
exports.LIT_FROST_VARIANT_VALUES = [
    'SchnorrEd25519Sha512',
    'SchnorrK256Sha256',
    'SchnorrP256Sha256',
    'SchnorrP384Sha384',
    'SchnorrRistretto25519Sha512',
    'SchnorrEd448Shake256',
    'SchnorrRedJubjubBlake2b512',
    'SchnorrK256Taproot',
    'SchnorrRedDecaf377Blake2b512',
    'SchnorrkelSubstrate',
];
exports.LIT_FROST_VARIANT = (0, exports.ObjectMapFromArray)(exports.LIT_FROST_VARIANT_VALUES);
exports.LIT_FROST_VARIANT_SCHEMA = zod_1.z.enum(exports.LIT_FROST_VARIANT_VALUES);
// ----- BLS Variant
// export const LIT_BLS_VARIANT_VALUES = [
//   'Bls12381G1ProofOfPossession',
// ] as const satisfies readonly BlsSigType[];
// export const LIT_BLS_VARIANT = ObjectMapFromArray(LIT_BLS_VARIANT_VALUES);
// export const LIT_BLS_VARIANT_SCHEMA = z.enum(LIT_BLS_VARIANT_VALUES);
// export type LitBlsVariantType = z.infer<typeof LIT_BLS_VARIANT_SCHEMA>;
// ----- ECDSA Variant
exports.LIT_ECDSA_VARIANT_VALUES = [
    'EcdsaK256Sha256',
    'EcdsaP256Sha256',
    'EcdsaP384Sha384',
];
exports.LIT_ECDSA_VARIANT = (0, exports.ObjectMapFromArray)(exports.LIT_ECDSA_VARIANT_VALUES);
exports.LIT_ECDSA_VARIANT_SCHEMA = zod_1.z.enum(exports.LIT_ECDSA_VARIANT_VALUES);
// ----- All Curve Types
exports.LIT_CURVE = {
    // ...LIT_BLS_VARIANT,
    ...exports.LIT_FROST_VARIANT,
    ...exports.LIT_ECDSA_VARIANT,
};
const litCurveEnumValues = Object.keys(exports.LIT_CURVE);
exports.SigningSchemeSchema = zod_1.z.enum(litCurveEnumValues);
exports.CURVE_GROUPS = ['BLS', 'ECDSA', 'FROST'];
exports.CURVE_GROUP_BY_CURVE_TYPE = {
    // BLS
    // [LIT_CURVE.Bls12381G1ProofOfPossession]: CURVE_GROUPS[0],
    // ECDSA
    [exports.LIT_CURVE.EcdsaK256Sha256]: exports.CURVE_GROUPS[1],
    [exports.LIT_CURVE.EcdsaP256Sha256]: exports.CURVE_GROUPS[1],
    [exports.LIT_CURVE.EcdsaP384Sha384]: exports.CURVE_GROUPS[1],
    // FROST
    [exports.LIT_CURVE.SchnorrEd25519Sha512]: exports.CURVE_GROUPS[2],
    [exports.LIT_CURVE.SchnorrK256Sha256]: exports.CURVE_GROUPS[2],
    [exports.LIT_CURVE.SchnorrP256Sha256]: exports.CURVE_GROUPS[2],
    [exports.LIT_CURVE.SchnorrP384Sha384]: exports.CURVE_GROUPS[2],
    [exports.LIT_CURVE.SchnorrRistretto25519Sha512]: exports.CURVE_GROUPS[2],
    [exports.LIT_CURVE.SchnorrEd448Shake256]: exports.CURVE_GROUPS[2],
    [exports.LIT_CURVE.SchnorrRedJubjubBlake2b512]: exports.CURVE_GROUPS[2],
    [exports.LIT_CURVE.SchnorrK256Taproot]: exports.CURVE_GROUPS[2],
    [exports.LIT_CURVE.SchnorrRedDecaf377Blake2b512]: exports.CURVE_GROUPS[2],
    [exports.LIT_CURVE.SchnorrkelSubstrate]: exports.CURVE_GROUPS[2],
};
//# sourceMappingURL=curves.js.map