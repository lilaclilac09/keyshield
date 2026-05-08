export declare const LIT_ENDPOINT_VERSION: {
    readonly V0: "/";
    readonly V1: "/v1";
    readonly V2: "/v2";
};
export declare const LIT_ENDPOINT: {
    readonly HANDSHAKE: {
        readonly path: "/web/handshake";
        readonly version: "/";
    };
    readonly SIGN_SESSION_KEY: {
        readonly path: "/web/sign_session_key";
        readonly version: "/v2";
    };
    readonly EXECUTE_JS: {
        readonly path: "/web/execute";
        readonly version: "/v2";
    };
    readonly PKP_SIGN: {
        readonly path: "/web/pkp/sign";
        readonly version: "/v2";
    };
    readonly PKP_CLAIM: {
        readonly path: "/web/pkp/claim";
        readonly version: "/";
    };
    readonly ENCRYPTION_SIGN: {
        readonly path: "/web/encryption/sign";
        readonly version: "/v2";
    };
};
