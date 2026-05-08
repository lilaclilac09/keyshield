import { AuthSig, PaymentDelegationAuthSigParams, PaymentDelegationScope } from '@lit-protocol/types';
declare const PAYMENT_DELEGATION_SCOPES: Set<PaymentDelegationScope>;
export declare const createPaymentDelegationAuthSig: (params: PaymentDelegationAuthSigParams) => Promise<AuthSig>;
export { PAYMENT_DELEGATION_SCOPES };
