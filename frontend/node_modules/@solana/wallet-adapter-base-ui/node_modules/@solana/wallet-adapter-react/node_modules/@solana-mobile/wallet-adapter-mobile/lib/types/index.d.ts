import { BaseSignInMessageSignerWalletAdapter, WalletName, WalletReadyState } from "@solana/wallet-adapter-base";
import { SolanaSignInInput, SolanaSignInOutput } from "@solana/wallet-standard-features";
import { Connection, PublicKey, SendOptions, Transaction, TransactionSignature, TransactionVersion, VersionedTransaction } from "@solana/web3.js";
import { AppIdentity, AuthorizationResult, Base64EncodedAddress, Chain, Cluster, SignInPayload } from "@solana-mobile/mobile-wallet-adapter-protocol";
import { Authorization, LocalSolanaMobileWalletAdapterWallet, RemoteSolanaMobileWalletAdapterWallet } from "@solana-mobile/wallet-standard-mobile";

//#region src/adapter.d.ts
interface AuthorizationResultCache {
  clear(): Promise<void>;
  get(): Promise<AuthorizationResult | Authorization | undefined>;
  set(authorizationResult: AuthorizationResult | Authorization): Promise<void>;
}
interface AddressSelector {
  select(addresses: Base64EncodedAddress[]): Promise<Base64EncodedAddress>;
}
declare const SolanaMobileWalletAdapterWalletName: WalletName;
declare const SolanaMobileWalletAdapterRemoteWalletName: WalletName;
declare abstract class BaseSolanaMobileWalletAdapter extends BaseSignInMessageSignerWalletAdapter {
  #private;
  readonly supportedTransactionVersions: Set<TransactionVersion>;
  name: WalletName;
  icon: `data:image/svg+xml;base64,${string}` | `data:image/webp;base64,${string}` | `data:image/png;base64,${string}` | `data:image/gif;base64,${string}`;
  url: string;
  protected constructor(wallet: LocalSolanaMobileWalletAdapterWallet | RemoteSolanaMobileWalletAdapterWallet, config: {
    addressSelector: AddressSelector;
    chain: Chain;
  });
  get publicKey(): PublicKey | null;
  get connected(): boolean;
  get connecting(): boolean;
  get readyState(): WalletReadyState;
  /** @deprecated Use `autoConnect()` instead. */
  autoConnect_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(): Promise<void>;
  autoConnect(): Promise<void>;
  connect(): Promise<void>;
  /** @deprecated Use `connect()` or `autoConnect()` instead. */
  performAuthorization(signInPayload?: SignInPayload): Promise<AuthorizationResult>;
  disconnect(): Promise<void>;
  signIn(input?: SolanaSignInInput): Promise<SolanaSignInOutput>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  sendTransaction<T extends Transaction | VersionedTransaction>(transaction: T, connection: Connection, options?: SendOptions): Promise<TransactionSignature>;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
}
declare class LocalSolanaMobileWalletAdapter extends BaseSolanaMobileWalletAdapter {
  /**
   * @deprecated @param cluster config paramter is deprecated, use @param chain instead
   */
  constructor(config: {
    addressSelector: AddressSelector;
    appIdentity: AppIdentity;
    authorizationResultCache: AuthorizationResultCache;
    cluster: Cluster;
    onWalletNotFound: (mobileWalletAdapter: LocalSolanaMobileWalletAdapter) => Promise<void>;
  });
  constructor(config: {
    addressSelector: AddressSelector;
    appIdentity: AppIdentity;
    authorizationResultCache: AuthorizationResultCache;
    chain: Chain;
    onWalletNotFound: (mobileWalletAdapter: LocalSolanaMobileWalletAdapter) => Promise<void>;
  });
}
declare class RemoteSolanaMobileWalletAdapter extends BaseSolanaMobileWalletAdapter {
  constructor(config: {
    addressSelector: AddressSelector;
    appIdentity: AppIdentity;
    authorizationResultCache: AuthorizationResultCache;
    chain: Chain;
    remoteHostAuthority: string;
    onWalletNotFound: (mobileWalletAdapter: RemoteSolanaMobileWalletAdapter) => Promise<void>;
  });
}
declare class SolanaMobileWalletAdapter extends LocalSolanaMobileWalletAdapter {}
//#endregion
//#region src/createDefaultAddressSelector.d.ts
declare function createDefaultAddressSelector(): AddressSelector;
//#endregion
//#region src/createDefaultAuthorizationResultCache.d.ts
declare function createDefaultAuthorizationResultCache(): AuthorizationResultCache;
//#endregion
//#region src/createDefaultWalletNotFoundHandler.d.ts
declare function createDefaultWalletNotFoundHandler(): (mobileWalletAdapter: SolanaMobileWalletAdapter) => Promise<void>;
//#endregion
export { AddressSelector, AuthorizationResultCache, LocalSolanaMobileWalletAdapter, RemoteSolanaMobileWalletAdapter, SolanaMobileWalletAdapter, SolanaMobileWalletAdapterRemoteWalletName, SolanaMobileWalletAdapterWalletName, createDefaultAddressSelector, createDefaultAuthorizationResultCache, createDefaultWalletNotFoundHandler };
//# sourceMappingURL=index.d.ts.map