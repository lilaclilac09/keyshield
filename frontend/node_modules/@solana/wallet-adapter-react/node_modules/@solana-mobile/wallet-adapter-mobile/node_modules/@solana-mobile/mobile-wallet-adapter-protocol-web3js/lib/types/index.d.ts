import { Transaction, TransactionSignature, VersionedTransaction } from "@solana/web3.js";
import { AuthorizeAPI, Base64EncodedAddress, CloneAuthorizationAPI, DeauthorizeAPI, GetCapabilitiesAPI, ReauthorizeAPI, RemoteWalletAssociationConfig, TerminateSessionAPI, WalletAssociationConfig } from "@solana-mobile/mobile-wallet-adapter-protocol";

//#region src/transact.d.ts
interface Web3SignAndSendTransactionsAPI {
  signAndSendTransactions<T extends Transaction | VersionedTransaction>(params: {
    minContextSlot?: number;
    commitment?: string;
    skipPreflight?: boolean;
    maxRetries?: number;
    waitForCommitmentToSendNextTransaction?: boolean;
    transactions: T[];
  }): Promise<TransactionSignature[]>;
}
interface Web3SignTransactionsAPI {
  signTransactions<T extends Transaction | VersionedTransaction>(params: {
    transactions: T[];
  }): Promise<T[]>;
}
interface Web3SignMessagesAPI {
  signMessages(params: {
    addresses: Base64EncodedAddress[];
    payloads: Uint8Array[];
  }): Promise<Uint8Array[]>;
}
interface Web3MobileWallet extends AuthorizeAPI, CloneAuthorizationAPI, DeauthorizeAPI, GetCapabilitiesAPI, ReauthorizeAPI, Web3SignAndSendTransactionsAPI, Web3SignTransactionsAPI, Web3SignMessagesAPI {}
interface Web3RemoteMobileWallet extends Web3MobileWallet, TerminateSessionAPI {}
type Web3Scenario = Readonly<{
  wallet: Promise<Web3MobileWallet>;
  close: () => void;
}>;
type Web3RemoteScenario = Web3Scenario & Readonly<{
  associationUrl: URL;
}>;
declare function transact<TReturn>(callback: (wallet: Web3MobileWallet) => TReturn, config?: WalletAssociationConfig): Promise<TReturn>;
declare function startRemoteScenario(config: RemoteWalletAssociationConfig): Promise<Web3RemoteScenario>;
//#endregion
export { Web3MobileWallet, Web3RemoteMobileWallet, Web3RemoteScenario, Web3Scenario, startRemoteScenario, transact };
//# sourceMappingURL=index.d.ts.map