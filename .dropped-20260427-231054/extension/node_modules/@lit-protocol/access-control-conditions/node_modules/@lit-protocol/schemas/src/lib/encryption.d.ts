import { z } from 'zod';
export declare const DecryptRequestBaseSchema: z.ZodObject<{
    accessControlConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[]>>;
    evmContractConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[]>>;
    solRpcConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[]>>;
    unifiedAccessControlConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[]>>;
} & {
    chain: z.ZodOptional<z.ZodDefault<z.ZodString>>;
} & {
    userMaxPrice: z.ZodOptional<z.ZodBigInt>;
} & {
    authContext: z.ZodUnion<[z.ZodObject<{
        pkpPublicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
        chain: z.ZodString;
        sessionKeyPair: z.ZodObject<{
            publicKey: z.ZodString;
            secretKey: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            publicKey: string;
            secretKey: string;
        }, {
            publicKey: string;
            secretKey: string;
        }>;
        authNeededCallback: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>;
        authConfig: z.ZodLazy<z.ZodEffects<z.ZodObject<{
            capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                sig: z.ZodString;
                derivedVia: z.ZodString;
                signedMessage: z.ZodString;
                address: z.ZodString;
                algo: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }>, "many">>>;
            expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
            domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                resource: z.ZodObject<{
                    getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                        readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                        readonly AccessControlConditionSigning: "access-control-condition-signing";
                        readonly PKPSigning: "pkp-signing";
                        readonly PaymentDelegation: "lit-payment-delegation";
                        readonly LitActionExecution: "lit-action-execution";
                    }>], z.ZodUnknown>, z.ZodBoolean>;
                    toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                        readonly AccessControlCondition: "lit-accesscontrolcondition";
                        readonly PKP: "lit-pkp";
                        readonly RLI: "lit-ratelimitincrease";
                        readonly PaymentDelegation: "lit-paymentdelegation";
                        readonly LitAction: "lit-litaction";
                    }>>;
                    resource: z.ZodReadonly<z.ZodString>;
                }, "strip", z.ZodTypeAny, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }>;
                ability: z.ZodNativeEnum<{
                    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                    readonly AccessControlConditionSigning: "access-control-condition-signing";
                    readonly PKPSigning: "pkp-signing";
                    readonly PaymentDelegation: "lit-payment-delegation";
                    readonly LitActionExecution: "lit-action-execution";
                }>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
            }, "strip", z.ZodTypeAny, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }>, "many">>>;
        }, "strip", z.ZodTypeAny, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, {
            capabilityAuthSigs?: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[] | undefined;
            expiration?: string | undefined;
            statement?: string | undefined;
            domain?: string | undefined;
            resources?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }>, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, unknown>>;
    }, "strip", z.ZodTypeAny, {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        pkpPublicKey?: string | undefined;
    }, {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        pkpPublicKey?: string | undefined;
        authConfig?: unknown;
    }>, z.ZodObject<{
        account: z.ZodAny;
        authenticator: z.ZodAny;
        authData: z.ZodLazy<z.ZodObject<{
            authMethodId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
            authMethodType: z.ZodPipeline<z.ZodNumber, z.ZodNativeEnum<{
                readonly EthWallet: 1;
                readonly LitAction: 2;
                readonly WebAuthn: 3;
                readonly Discord: 4;
                readonly Google: 5;
                readonly GoogleJwt: 6;
                readonly AppleJwt: 8;
                readonly StytchOtp: 9;
                readonly StytchEmailFactorOtp: 10;
                readonly StytchSmsFactorOtp: 11;
                readonly StytchWhatsAppFactorOtp: 12;
                readonly StytchTotpFactorOtp: 13;
            }>>;
            accessToken: z.ZodString;
            publicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
            metadata: z.ZodOptional<z.ZodAny>;
        }, "strip", z.ZodTypeAny, {
            authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        }, {
            authMethodType: number;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        }>>;
        authNeededCallback: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>;
        sessionKeyPair: z.ZodObject<{
            publicKey: z.ZodString;
            secretKey: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            publicKey: string;
            secretKey: string;
        }, {
            publicKey: string;
            secretKey: string;
        }>;
        authConfig: z.ZodLazy<z.ZodEffects<z.ZodObject<{
            capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                sig: z.ZodString;
                derivedVia: z.ZodString;
                signedMessage: z.ZodString;
                address: z.ZodString;
                algo: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }>, "many">>>;
            expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
            domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                resource: z.ZodObject<{
                    getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                        readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                        readonly AccessControlConditionSigning: "access-control-condition-signing";
                        readonly PKPSigning: "pkp-signing";
                        readonly PaymentDelegation: "lit-payment-delegation";
                        readonly LitActionExecution: "lit-action-execution";
                    }>], z.ZodUnknown>, z.ZodBoolean>;
                    toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                        readonly AccessControlCondition: "lit-accesscontrolcondition";
                        readonly PKP: "lit-pkp";
                        readonly RLI: "lit-ratelimitincrease";
                        readonly PaymentDelegation: "lit-paymentdelegation";
                        readonly LitAction: "lit-litaction";
                    }>>;
                    resource: z.ZodReadonly<z.ZodString>;
                }, "strip", z.ZodTypeAny, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }>;
                ability: z.ZodNativeEnum<{
                    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                    readonly AccessControlConditionSigning: "access-control-condition-signing";
                    readonly PKPSigning: "pkp-signing";
                    readonly PaymentDelegation: "lit-payment-delegation";
                    readonly LitActionExecution: "lit-action-execution";
                }>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
            }, "strip", z.ZodTypeAny, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }>, "many">>>;
        }, "strip", z.ZodTypeAny, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, {
            capabilityAuthSigs?: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[] | undefined;
            expiration?: string | undefined;
            statement?: string | undefined;
            domain?: string | undefined;
            resources?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }>, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, unknown>>;
    }, "strip", z.ZodTypeAny, {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        authData: {
            authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authenticator?: any;
    }, {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authData: {
            authMethodType: number;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authConfig?: unknown;
        authenticator?: any;
    }>]>;
    authSig: z.ZodOptional<z.ZodObject<{
        sig: z.ZodString;
        derivedVia: z.ZodString;
        signedMessage: z.ZodString;
        address: z.ZodString;
        algo: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    }, {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    authContext: {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        pkpPublicKey?: string | undefined;
    } | {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        authData: {
            authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authenticator?: any;
    };
    chain?: string | undefined;
    userMaxPrice?: bigint | undefined;
    accessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[] | undefined;
    evmContractConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[] | undefined;
    solRpcConditions?: import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[] | undefined;
    unifiedAccessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[] | undefined;
    authSig?: {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    } | undefined;
}, {
    authContext: {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        pkpPublicKey?: string | undefined;
        authConfig?: unknown;
    } | {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authData: {
            authMethodType: number;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authConfig?: unknown;
        authenticator?: any;
    };
    chain?: string | undefined;
    userMaxPrice?: bigint | undefined;
    accessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[] | undefined;
    evmContractConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[] | undefined;
    solRpcConditions?: import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[] | undefined;
    unifiedAccessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[] | undefined;
    authSig?: {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    } | undefined;
}>;
export declare const EncryptionMetadataSchema: z.ZodOptional<z.ZodObject<{
    /**
     * The expected data type for decryption conversion
     * Supported types: 'uint8array', 'string', 'json', 'buffer', 'image', 'video', 'file'
     */
    dataType: z.ZodOptional<z.ZodEnum<["uint8array", "string", "json", "buffer", "image", "video", "file"]>>;
    /**
     * MIME type of the file (for image, video, file types)
     */
    mimeType: z.ZodOptional<z.ZodString>;
    /**
     * Original filename (for image, video, file types)
     */
    filename: z.ZodOptional<z.ZodString>;
    /**
     * File size in bytes
     */
    size: z.ZodOptional<z.ZodNumber>;
    /**
     * Additional custom metadata
     */
    custom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
    custom?: Record<string, any> | undefined;
    mimeType?: string | undefined;
    filename?: string | undefined;
    size?: number | undefined;
}, {
    dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
    custom?: Record<string, any> | undefined;
    mimeType?: string | undefined;
    filename?: string | undefined;
    size?: number | undefined;
}>>;
export declare const EncryptResponseSchema: z.ZodObject<{
    /**
     * The base64-encoded ciphertext
     */
    ciphertext: z.ZodString;
    /**
     * The hash of the data that was encrypted
     */
    dataToEncryptHash: z.ZodString;
    /**
     * Optional metadata containing information about the encrypted data
     */
    metadata: z.ZodOptional<z.ZodObject<{
        /**
         * The expected data type for decryption conversion
         * Supported types: 'uint8array', 'string', 'json', 'buffer', 'image', 'video', 'file'
         */
        dataType: z.ZodOptional<z.ZodEnum<["uint8array", "string", "json", "buffer", "image", "video", "file"]>>;
        /**
         * MIME type of the file (for image, video, file types)
         */
        mimeType: z.ZodOptional<z.ZodString>;
        /**
         * Original filename (for image, video, file types)
         */
        filename: z.ZodOptional<z.ZodString>;
        /**
         * File size in bytes
         */
        size: z.ZodOptional<z.ZodNumber>;
        /**
         * Additional custom metadata
         */
        custom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    }, {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    ciphertext: string;
    dataToEncryptHash: string;
    metadata?: {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    } | undefined;
}, {
    ciphertext: string;
    dataToEncryptHash: string;
    metadata?: {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    } | undefined;
}>;
export declare const DecryptRequestSchema: z.ZodUnion<[z.ZodObject<{
    /**
     * The base64-encoded ciphertext
     */
    ciphertext: z.ZodString;
    /**
     * The hash of the data that was encrypted
     */
    dataToEncryptHash: z.ZodString;
    /**
     * Optional metadata containing information about the encrypted data
     */
    metadata: z.ZodOptional<z.ZodObject<{
        /**
         * The expected data type for decryption conversion
         * Supported types: 'uint8array', 'string', 'json', 'buffer', 'image', 'video', 'file'
         */
        dataType: z.ZodOptional<z.ZodEnum<["uint8array", "string", "json", "buffer", "image", "video", "file"]>>;
        /**
         * MIME type of the file (for image, video, file types)
         */
        mimeType: z.ZodOptional<z.ZodString>;
        /**
         * Original filename (for image, video, file types)
         */
        filename: z.ZodOptional<z.ZodString>;
        /**
         * File size in bytes
         */
        size: z.ZodOptional<z.ZodNumber>;
        /**
         * Additional custom metadata
         */
        custom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    }, {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    }>>;
} & {
    accessControlConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[]>>;
    evmContractConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[]>>;
    solRpcConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[]>>;
    unifiedAccessControlConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[]>>;
} & {
    chain: z.ZodOptional<z.ZodDefault<z.ZodString>>;
} & {
    userMaxPrice: z.ZodOptional<z.ZodBigInt>;
} & {
    authContext: z.ZodUnion<[z.ZodObject<{
        pkpPublicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
        chain: z.ZodString;
        sessionKeyPair: z.ZodObject<{
            publicKey: z.ZodString;
            secretKey: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            publicKey: string;
            secretKey: string;
        }, {
            publicKey: string;
            secretKey: string;
        }>;
        authNeededCallback: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>;
        authConfig: z.ZodLazy<z.ZodEffects<z.ZodObject<{
            capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                sig: z.ZodString;
                derivedVia: z.ZodString;
                signedMessage: z.ZodString;
                address: z.ZodString;
                algo: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }>, "many">>>;
            expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
            domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                resource: z.ZodObject<{
                    getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                        readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                        readonly AccessControlConditionSigning: "access-control-condition-signing";
                        readonly PKPSigning: "pkp-signing";
                        readonly PaymentDelegation: "lit-payment-delegation";
                        readonly LitActionExecution: "lit-action-execution";
                    }>], z.ZodUnknown>, z.ZodBoolean>;
                    toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                        readonly AccessControlCondition: "lit-accesscontrolcondition";
                        readonly PKP: "lit-pkp";
                        readonly RLI: "lit-ratelimitincrease";
                        readonly PaymentDelegation: "lit-paymentdelegation";
                        readonly LitAction: "lit-litaction";
                    }>>;
                    resource: z.ZodReadonly<z.ZodString>;
                }, "strip", z.ZodTypeAny, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }>;
                ability: z.ZodNativeEnum<{
                    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                    readonly AccessControlConditionSigning: "access-control-condition-signing";
                    readonly PKPSigning: "pkp-signing";
                    readonly PaymentDelegation: "lit-payment-delegation";
                    readonly LitActionExecution: "lit-action-execution";
                }>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
            }, "strip", z.ZodTypeAny, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }>, "many">>>;
        }, "strip", z.ZodTypeAny, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, {
            capabilityAuthSigs?: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[] | undefined;
            expiration?: string | undefined;
            statement?: string | undefined;
            domain?: string | undefined;
            resources?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }>, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, unknown>>;
    }, "strip", z.ZodTypeAny, {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        pkpPublicKey?: string | undefined;
    }, {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        pkpPublicKey?: string | undefined;
        authConfig?: unknown;
    }>, z.ZodObject<{
        account: z.ZodAny;
        authenticator: z.ZodAny;
        authData: z.ZodLazy<z.ZodObject<{
            authMethodId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
            authMethodType: z.ZodPipeline<z.ZodNumber, z.ZodNativeEnum<{
                readonly EthWallet: 1;
                readonly LitAction: 2;
                readonly WebAuthn: 3;
                readonly Discord: 4;
                readonly Google: 5;
                readonly GoogleJwt: 6;
                readonly AppleJwt: 8;
                readonly StytchOtp: 9;
                readonly StytchEmailFactorOtp: 10;
                readonly StytchSmsFactorOtp: 11;
                readonly StytchWhatsAppFactorOtp: 12;
                readonly StytchTotpFactorOtp: 13;
            }>>;
            accessToken: z.ZodString;
            publicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
            metadata: z.ZodOptional<z.ZodAny>;
        }, "strip", z.ZodTypeAny, {
            authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        }, {
            authMethodType: number;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        }>>;
        authNeededCallback: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>;
        sessionKeyPair: z.ZodObject<{
            publicKey: z.ZodString;
            secretKey: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            publicKey: string;
            secretKey: string;
        }, {
            publicKey: string;
            secretKey: string;
        }>;
        authConfig: z.ZodLazy<z.ZodEffects<z.ZodObject<{
            capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                sig: z.ZodString;
                derivedVia: z.ZodString;
                signedMessage: z.ZodString;
                address: z.ZodString;
                algo: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }>, "many">>>;
            expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
            domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                resource: z.ZodObject<{
                    getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                        readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                        readonly AccessControlConditionSigning: "access-control-condition-signing";
                        readonly PKPSigning: "pkp-signing";
                        readonly PaymentDelegation: "lit-payment-delegation";
                        readonly LitActionExecution: "lit-action-execution";
                    }>], z.ZodUnknown>, z.ZodBoolean>;
                    toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                        readonly AccessControlCondition: "lit-accesscontrolcondition";
                        readonly PKP: "lit-pkp";
                        readonly RLI: "lit-ratelimitincrease";
                        readonly PaymentDelegation: "lit-paymentdelegation";
                        readonly LitAction: "lit-litaction";
                    }>>;
                    resource: z.ZodReadonly<z.ZodString>;
                }, "strip", z.ZodTypeAny, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }>;
                ability: z.ZodNativeEnum<{
                    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                    readonly AccessControlConditionSigning: "access-control-condition-signing";
                    readonly PKPSigning: "pkp-signing";
                    readonly PaymentDelegation: "lit-payment-delegation";
                    readonly LitActionExecution: "lit-action-execution";
                }>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
            }, "strip", z.ZodTypeAny, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }>, "many">>>;
        }, "strip", z.ZodTypeAny, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, {
            capabilityAuthSigs?: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[] | undefined;
            expiration?: string | undefined;
            statement?: string | undefined;
            domain?: string | undefined;
            resources?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }>, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, unknown>>;
    }, "strip", z.ZodTypeAny, {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        authData: {
            authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authenticator?: any;
    }, {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authData: {
            authMethodType: number;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authConfig?: unknown;
        authenticator?: any;
    }>]>;
    authSig: z.ZodOptional<z.ZodObject<{
        sig: z.ZodString;
        derivedVia: z.ZodString;
        signedMessage: z.ZodString;
        address: z.ZodString;
        algo: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    }, {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    authContext: {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        pkpPublicKey?: string | undefined;
    } | {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        authData: {
            authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authenticator?: any;
    };
    ciphertext: string;
    dataToEncryptHash: string;
    chain?: string | undefined;
    userMaxPrice?: bigint | undefined;
    metadata?: {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    } | undefined;
    accessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[] | undefined;
    evmContractConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[] | undefined;
    solRpcConditions?: import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[] | undefined;
    unifiedAccessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[] | undefined;
    authSig?: {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    } | undefined;
}, {
    authContext: {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        pkpPublicKey?: string | undefined;
        authConfig?: unknown;
    } | {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authData: {
            authMethodType: number;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authConfig?: unknown;
        authenticator?: any;
    };
    ciphertext: string;
    dataToEncryptHash: string;
    chain?: string | undefined;
    userMaxPrice?: bigint | undefined;
    metadata?: {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    } | undefined;
    accessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[] | undefined;
    evmContractConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[] | undefined;
    solRpcConditions?: import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[] | undefined;
    unifiedAccessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[] | undefined;
    authSig?: {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    } | undefined;
}>, z.ZodObject<{
    accessControlConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[]>>;
    evmContractConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[]>>;
    solRpcConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[]>>;
    unifiedAccessControlConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[]>>;
} & {
    chain: z.ZodOptional<z.ZodDefault<z.ZodString>>;
} & {
    userMaxPrice: z.ZodOptional<z.ZodBigInt>;
} & {
    authContext: z.ZodUnion<[z.ZodObject<{
        pkpPublicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
        chain: z.ZodString;
        sessionKeyPair: z.ZodObject<{
            publicKey: z.ZodString;
            secretKey: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            publicKey: string;
            secretKey: string;
        }, {
            publicKey: string;
            secretKey: string;
        }>;
        authNeededCallback: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>;
        authConfig: z.ZodLazy<z.ZodEffects<z.ZodObject<{
            capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                sig: z.ZodString;
                derivedVia: z.ZodString;
                signedMessage: z.ZodString;
                address: z.ZodString;
                algo: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }>, "many">>>;
            expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
            domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                resource: z.ZodObject<{
                    getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                        readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                        readonly AccessControlConditionSigning: "access-control-condition-signing";
                        readonly PKPSigning: "pkp-signing";
                        readonly PaymentDelegation: "lit-payment-delegation";
                        readonly LitActionExecution: "lit-action-execution";
                    }>], z.ZodUnknown>, z.ZodBoolean>;
                    toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                        readonly AccessControlCondition: "lit-accesscontrolcondition";
                        readonly PKP: "lit-pkp";
                        readonly RLI: "lit-ratelimitincrease";
                        readonly PaymentDelegation: "lit-paymentdelegation";
                        readonly LitAction: "lit-litaction";
                    }>>;
                    resource: z.ZodReadonly<z.ZodString>;
                }, "strip", z.ZodTypeAny, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }>;
                ability: z.ZodNativeEnum<{
                    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                    readonly AccessControlConditionSigning: "access-control-condition-signing";
                    readonly PKPSigning: "pkp-signing";
                    readonly PaymentDelegation: "lit-payment-delegation";
                    readonly LitActionExecution: "lit-action-execution";
                }>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
            }, "strip", z.ZodTypeAny, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }>, "many">>>;
        }, "strip", z.ZodTypeAny, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, {
            capabilityAuthSigs?: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[] | undefined;
            expiration?: string | undefined;
            statement?: string | undefined;
            domain?: string | undefined;
            resources?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }>, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, unknown>>;
    }, "strip", z.ZodTypeAny, {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        pkpPublicKey?: string | undefined;
    }, {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        pkpPublicKey?: string | undefined;
        authConfig?: unknown;
    }>, z.ZodObject<{
        account: z.ZodAny;
        authenticator: z.ZodAny;
        authData: z.ZodLazy<z.ZodObject<{
            authMethodId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
            authMethodType: z.ZodPipeline<z.ZodNumber, z.ZodNativeEnum<{
                readonly EthWallet: 1;
                readonly LitAction: 2;
                readonly WebAuthn: 3;
                readonly Discord: 4;
                readonly Google: 5;
                readonly GoogleJwt: 6;
                readonly AppleJwt: 8;
                readonly StytchOtp: 9;
                readonly StytchEmailFactorOtp: 10;
                readonly StytchSmsFactorOtp: 11;
                readonly StytchWhatsAppFactorOtp: 12;
                readonly StytchTotpFactorOtp: 13;
            }>>;
            accessToken: z.ZodString;
            publicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
            metadata: z.ZodOptional<z.ZodAny>;
        }, "strip", z.ZodTypeAny, {
            authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        }, {
            authMethodType: number;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        }>>;
        authNeededCallback: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>;
        sessionKeyPair: z.ZodObject<{
            publicKey: z.ZodString;
            secretKey: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            publicKey: string;
            secretKey: string;
        }, {
            publicKey: string;
            secretKey: string;
        }>;
        authConfig: z.ZodLazy<z.ZodEffects<z.ZodObject<{
            capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                sig: z.ZodString;
                derivedVia: z.ZodString;
                signedMessage: z.ZodString;
                address: z.ZodString;
                algo: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }, {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }>, "many">>>;
            expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
            domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
            resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
                resource: z.ZodObject<{
                    getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                        readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                        readonly AccessControlConditionSigning: "access-control-condition-signing";
                        readonly PKPSigning: "pkp-signing";
                        readonly PaymentDelegation: "lit-payment-delegation";
                        readonly LitActionExecution: "lit-action-execution";
                    }>], z.ZodUnknown>, z.ZodBoolean>;
                    toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                        readonly AccessControlCondition: "lit-accesscontrolcondition";
                        readonly PKP: "lit-pkp";
                        readonly RLI: "lit-ratelimitincrease";
                        readonly PaymentDelegation: "lit-paymentdelegation";
                        readonly LitAction: "lit-litaction";
                    }>>;
                    resource: z.ZodReadonly<z.ZodString>;
                }, "strip", z.ZodTypeAny, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }, {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                }>;
                ability: z.ZodNativeEnum<{
                    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                    readonly AccessControlConditionSigning: "access-control-condition-signing";
                    readonly PKPSigning: "pkp-signing";
                    readonly PaymentDelegation: "lit-payment-delegation";
                    readonly LitActionExecution: "lit-action-execution";
                }>;
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
            }, "strip", z.ZodTypeAny, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }>, "many">>>;
        }, "strip", z.ZodTypeAny, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, {
            capabilityAuthSigs?: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[] | undefined;
            expiration?: string | undefined;
            statement?: string | undefined;
            domain?: string | undefined;
            resources?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }>, {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        }, unknown>>;
    }, "strip", z.ZodTypeAny, {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        authData: {
            authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authenticator?: any;
    }, {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authData: {
            authMethodType: number;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authConfig?: unknown;
        authenticator?: any;
    }>]>;
    authSig: z.ZodOptional<z.ZodObject<{
        sig: z.ZodString;
        derivedVia: z.ZodString;
        signedMessage: z.ZodString;
        address: z.ZodString;
        algo: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    }, {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    }>>;
} & {
    /**
     * The complete encrypted response object from encryption
     */
    data: z.ZodObject<{
        /**
         * The base64-encoded ciphertext
         */
        ciphertext: z.ZodString;
        /**
         * The hash of the data that was encrypted
         */
        dataToEncryptHash: z.ZodString;
        /**
         * Optional metadata containing information about the encrypted data
         */
        metadata: z.ZodOptional<z.ZodObject<{
            /**
             * The expected data type for decryption conversion
             * Supported types: 'uint8array', 'string', 'json', 'buffer', 'image', 'video', 'file'
             */
            dataType: z.ZodOptional<z.ZodEnum<["uint8array", "string", "json", "buffer", "image", "video", "file"]>>;
            /**
             * MIME type of the file (for image, video, file types)
             */
            mimeType: z.ZodOptional<z.ZodString>;
            /**
             * Original filename (for image, video, file types)
             */
            filename: z.ZodOptional<z.ZodString>;
            /**
             * File size in bytes
             */
            size: z.ZodOptional<z.ZodNumber>;
            /**
             * Additional custom metadata
             */
            custom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
            custom?: Record<string, any> | undefined;
            mimeType?: string | undefined;
            filename?: string | undefined;
            size?: number | undefined;
        }, {
            dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
            custom?: Record<string, any> | undefined;
            mimeType?: string | undefined;
            filename?: string | undefined;
            size?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        ciphertext: string;
        dataToEncryptHash: string;
        metadata?: {
            dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
            custom?: Record<string, any> | undefined;
            mimeType?: string | undefined;
            filename?: string | undefined;
            size?: number | undefined;
        } | undefined;
    }, {
        ciphertext: string;
        dataToEncryptHash: string;
        metadata?: {
            dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
            custom?: Record<string, any> | undefined;
            mimeType?: string | undefined;
            filename?: string | undefined;
            size?: number | undefined;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    data: {
        ciphertext: string;
        dataToEncryptHash: string;
        metadata?: {
            dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
            custom?: Record<string, any> | undefined;
            mimeType?: string | undefined;
            filename?: string | undefined;
            size?: number | undefined;
        } | undefined;
    };
    authContext: {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        pkpPublicKey?: string | undefined;
    } | {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authConfig: {
            capabilityAuthSigs: {
                address: string;
                signedMessage: string;
                sig: string;
                derivedVia: string;
                algo?: string | undefined;
            }[];
            expiration: string;
            statement: string;
            domain: string;
            resources: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[];
        };
        authData: {
            authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authenticator?: any;
    };
    chain?: string | undefined;
    userMaxPrice?: bigint | undefined;
    accessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[] | undefined;
    evmContractConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[] | undefined;
    solRpcConditions?: import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[] | undefined;
    unifiedAccessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[] | undefined;
    authSig?: {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    } | undefined;
}, {
    data: {
        ciphertext: string;
        dataToEncryptHash: string;
        metadata?: {
            dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
            custom?: Record<string, any> | undefined;
            mimeType?: string | undefined;
            filename?: string | undefined;
            size?: number | undefined;
        } | undefined;
    };
    authContext: {
        chain: string;
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        pkpPublicKey?: string | undefined;
        authConfig?: unknown;
    } | {
        sessionKeyPair: {
            publicKey: string;
            secretKey: string;
        };
        authNeededCallback: (...args: unknown[]) => unknown;
        authData: {
            authMethodType: number;
            accessToken: string;
            authMethodId: string;
            publicKey?: string | undefined;
            metadata?: any;
        };
        account?: any;
        authConfig?: unknown;
        authenticator?: any;
    };
    chain?: string | undefined;
    userMaxPrice?: bigint | undefined;
    accessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[] | undefined;
    evmContractConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[] | undefined;
    solRpcConditions?: import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[] | undefined;
    unifiedAccessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[] | undefined;
    authSig?: {
        address: string;
        signedMessage: string;
        sig: string;
        derivedVia: string;
        algo?: string | undefined;
    } | undefined;
}>]>;
export declare const EncryptRequestSchema: z.ZodObject<{
    accessControlConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[]>>;
    evmContractConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[]>>;
    solRpcConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[]>>;
    unifiedAccessControlConditions: z.ZodOptional<z.ZodType<import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[], z.ZodTypeDef, import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[]>>;
} & {
    chain: z.ZodOptional<z.ZodDefault<z.ZodString>>;
} & {
    /**
     * The data to encrypt - can be string, object, or Uint8Array
     */
    dataToEncrypt: z.ZodUnion<[z.ZodString, z.ZodRecord<z.ZodString, z.ZodAny>, z.ZodArray<z.ZodAny, "many">, z.ZodType<Uint8Array<ArrayBuffer>, z.ZodTypeDef, Uint8Array<ArrayBuffer>>]>;
    /**
     * Optional metadata containing information about the data to encrypt
     */
    metadata: z.ZodOptional<z.ZodObject<{
        /**
         * The expected data type for decryption conversion
         * Supported types: 'uint8array', 'string', 'json', 'buffer', 'image', 'video', 'file'
         */
        dataType: z.ZodOptional<z.ZodEnum<["uint8array", "string", "json", "buffer", "image", "video", "file"]>>;
        /**
         * MIME type of the file (for image, video, file types)
         */
        mimeType: z.ZodOptional<z.ZodString>;
        /**
         * Original filename (for image, video, file types)
         */
        filename: z.ZodOptional<z.ZodString>;
        /**
         * File size in bytes
         */
        size: z.ZodOptional<z.ZodNumber>;
        /**
         * Additional custom metadata
         */
        custom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    }, {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    dataToEncrypt: string | any[] | Uint8Array<ArrayBuffer> | Record<string, any>;
    chain?: string | undefined;
    metadata?: {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    } | undefined;
    accessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[] | undefined;
    evmContractConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[] | undefined;
    solRpcConditions?: import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[] | undefined;
    unifiedAccessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[] | undefined;
}, {
    dataToEncrypt: string | any[] | Uint8Array<ArrayBuffer> | Record<string, any>;
    chain?: string | undefined;
    metadata?: {
        dataType?: "string" | "buffer" | "uint8array" | "json" | "image" | "video" | "file" | undefined;
        custom?: Record<string, any> | undefined;
        mimeType?: string | undefined;
        filename?: string | undefined;
        size?: number | undefined;
    } | undefined;
    accessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmBasicCondition[] | undefined;
    evmContractConditions?: import("@lit-protocol/access-control-conditions-schemas").EvmContractCondition[] | undefined;
    solRpcConditions?: import("@lit-protocol/access-control-conditions-schemas").SolRpcCondition[] | undefined;
    unifiedAccessControlConditions?: import("@lit-protocol/access-control-conditions-schemas").UnifiedAccessControlCondition[] | undefined;
}>;
