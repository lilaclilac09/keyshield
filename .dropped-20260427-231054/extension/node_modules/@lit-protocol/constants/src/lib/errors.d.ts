import { Options, VError } from '@openagenda/verror';
import { ConstantValues } from './constants/constants';
export declare const LIT_ERROR_KIND: {
    readonly Unknown: "Unknown";
    readonly Unexpected: "Unexpected";
    readonly Generic: "Generic";
    readonly Config: "Config";
    readonly Validation: "Validation";
    readonly Conversion: "Conversion";
    readonly Parser: "Parser";
    readonly Serializer: "Serializer";
    readonly Timeout: "Timeout";
    readonly Pricing: "Pricing";
};
interface ErrorConfig {
    name: string;
    code: string;
    kind: ConstantValues<typeof LIT_ERROR_KIND>;
}
export declare const LIT_ERROR: Record<string, ErrorConfig>;
export declare const LIT_ERROR_CODE: {
    readonly NODE_NOT_AUTHORIZED: "NodeNotAuthorized";
};
export declare abstract class LitError extends VError {
    protected constructor(options: Error | Options, message: string, ...params: unknown[]);
}
type LitErrorConstructor = new (options: Error | Options, message: string, ...params: unknown[]) => LitError;
export interface LitErrorClass {
    name: string;
    code: string;
    kind: string;
}
declare const MultiError: any;
export { MultiError };
export declare const AutomationError: LitErrorConstructor, CurveTypeNotFoundError: LitErrorConstructor, InitError: LitErrorConstructor, InvalidAccessControlConditions: LitErrorConstructor, InvalidArgumentException: LitErrorConstructor, InvalidBooleanException: LitErrorConstructor, InvalidEthBlockhash: LitErrorConstructor, InvalidSessionSigs: LitErrorConstructor, InvalidNodeAttestation: LitErrorConstructor, InvalidParamType: LitErrorConstructor, InvalidSignatureError: LitErrorConstructor, InvalidUnifiedConditionType: LitErrorConstructor, LitNetworkError: LitErrorConstructor, LitNodeClientBadConfigError: LitErrorConstructor, LitNodeClientNotReadyError: LitErrorConstructor, LocalStorageItemNotFoundException: LitErrorConstructor, LocalStorageItemNotRemovedException: LitErrorConstructor, LocalStorageItemNotSetException: LitErrorConstructor, MaxPriceTooLow: LitErrorConstructor, MintingNotSupported: LitErrorConstructor, NetworkError: LitErrorConstructor, NoValidShares: LitErrorConstructor, NoWalletException: LitErrorConstructor, NodeError: LitErrorConstructor, NodejsException: LitErrorConstructor, ParamNullError: LitErrorConstructor, ParamsMissingError: LitErrorConstructor, RemovedFunctionError: LitErrorConstructor, TransactionError: LitErrorConstructor, UnauthorizedException: LitErrorConstructor, UnknownDecryptionAlgorithmTypeError: LitErrorConstructor, UnknownError: LitErrorConstructor, UnknownSignatureError: LitErrorConstructor, UnknownSignatureType: LitErrorConstructor, UnsupportedChainException: LitErrorConstructor, UnsupportedMethodError: LitErrorConstructor, WalletSignatureNotFoundError: LitErrorConstructor, WasmInitError: LitErrorConstructor, WrongNetworkException: LitErrorConstructor, WrongParamFormat: LitErrorConstructor, WrongAccountType: LitErrorConstructor;
