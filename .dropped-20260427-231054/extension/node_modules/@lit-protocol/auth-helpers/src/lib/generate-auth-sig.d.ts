import { ethers } from 'ethers';
import { AuthSig, SignerLike } from '@lit-protocol/types';
import { Account, Hex, WalletClient } from 'viem';
import { GetWalletClientReturnType } from '@wagmi/core';
type ExpectedAccountOrWalletClient = Account | WalletClient | GetWalletClientReturnType;
/**
 * Generate an AuthSig object using the signer.
 *
 * For more context:
 * We are only using authSig to generate session sigs. In a newer version, we will stop accepting
 * authSig all together from the node and will only accept session sigs. The address being
 * used here will be checksummed.
 *
 * @param signer the signer must have a "signMessage" method
 * @param toSign - the message to sign
 * @param address - (optional) the address of the signer
 * @returns
 */
export declare const generateAuthSig: ({ signer, toSign, address, algo, }: {
    signer: ethers.Wallet | ethers.Signer | SignerLike | {
        signMessage: (message: any) => Promise<string>;
        getAddress?: () => Promise<string>;
    };
    toSign: string;
    address?: string;
    algo?: "ed25519";
}) => Promise<AuthSig>;
export declare const generateAuthSigWithViem: ({ account, toSign, algo, address, }: {
    account: ExpectedAccountOrWalletClient;
    toSign: string | Hex;
    algo?: "ed25519";
    address: string;
}) => Promise<AuthSig>;
export {};
