"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIT_ENDPOINT = exports.LIT_ENDPOINT_VERSION = void 0;
exports.LIT_ENDPOINT_VERSION = {
    V0: '/',
    V1: '/v1',
    V2: '/v2',
};
// @deprecated - this will be provided by each network module
exports.LIT_ENDPOINT = {
    // internal
    HANDSHAKE: {
        path: '/web/handshake',
        version: exports.LIT_ENDPOINT_VERSION.V0,
    },
    SIGN_SESSION_KEY: {
        path: '/web/sign_session_key',
        version: exports.LIT_ENDPOINT_VERSION.V2,
    },
    // public
    EXECUTE_JS: {
        path: '/web/execute',
        version: exports.LIT_ENDPOINT_VERSION.V2,
    },
    PKP_SIGN: {
        path: '/web/pkp/sign',
        version: exports.LIT_ENDPOINT_VERSION.V2,
    },
    PKP_CLAIM: {
        path: '/web/pkp/claim',
        version: exports.LIT_ENDPOINT_VERSION.V0,
    },
    ENCRYPTION_SIGN: {
        path: '/web/encryption/sign',
        version: exports.LIT_ENDPOINT_VERSION.V2,
    },
};
//# sourceMappingURL=endpoints.js.map