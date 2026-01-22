/**
 * Vault Client for Extension
 * Adapts the existing KeyShield client for extension context
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import * as LitJsSdk from '@lit-protocol/lit-node-client';
import { LIT_NETWORK } from '@lit-protocol/constants';
import { AccessControlConditions } from '@lit-protocol/types';

// Import types from constants (simplified for extension)
const INSTRUCTION = {
  STORE_KEY: 0,
  ACCESS_KEY: 1,
  SHARE_KEY: 2,
} as const;

const VAULT_SEED = 'vault';
const VAULT_SIZE = 288;

export interface Vault {
  discriminator: Uint8Array;
  owner: PublicKey;
  encryptedKey: Uint8Array;
  zkCommit: Uint8Array;
  mpcHash: Uint8Array;
  createdAt: number;
  accessFlags: number;
}

export interface StoreKeyParams {
  apiKey: string;
  keyName: string;
  domain: string;
  timeLocked?: boolean;
}

export class ExtensionVaultClient {
  private connection: Connection;
  private programId: PublicKey;
  private litClient: LitJsSdk.LitNodeClient | null = null;

  constructor(rpcUrl?: string, programId?: string) {
    const rpc = rpcUrl || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpc, 'confirmed');

    const programIdStr = programId || '11111111111111111111111111111111';
    this.programId = new PublicKey(programIdStr);
  }

  /**
   * Initialize Lit Protocol client
   */
  async initLitClient(): Promise<void> {
    if (this.litClient) return;

    const network = (process.env.LIT_NETWORK || 'datil') as any;
    this.litClient = new LitJsSdk.LitNodeClient({
      litNetwork: network,
    });

    await this.litClient.connect();
  }

  /**
   * Derive vault PDA
   */
  async deriveVaultPDA(owner: PublicKey): Promise<[PublicKey, number]> {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(VAULT_SEED), owner.toBuffer()],
      this.programId
    );
    return [pda, bump];
  }

  /**
   * Encrypt key with Lit Protocol
   */
  async encryptWithLit(
    dataToEncrypt: string,
    walletAddress: string
  ): Promise<{ ciphertext: string; dataToEncryptHash: string }> {
    await this.initLitClient();

    const accessControlConditions: AccessControlConditions = [
      {
        conditionType: 'solana',
        method: '',
        params: [':userAddress'],
        chain: 'solana',
        returnValueTest: {
          comparator: '=',
          value: walletAddress,
        },
      },
    ];

    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
      {
        accessControlConditions,
        dataToEncrypt,
        chain: 'solana',
      },
      this.litClient!
    );

    return { ciphertext, dataToEncryptHash };
  }

  /**
   * Decrypt key with Lit Protocol
   */
  async decryptWithLit(
    ciphertext: string,
    dataToEncryptHash: string,
    walletAddress: string,
    sessionSigs: any
  ): Promise<string> {
    await this.initLitClient();

    const accessControlConditions: AccessControlConditions = [
      {
        conditionType: 'solana',
        method: '',
        params: [':userAddress'],
        chain: 'solana',
        returnValueTest: {
          comparator: '=',
          value: walletAddress,
        },
      },
    ];

    const decryptedString = await LitJsSdk.decryptToString(
      {
        accessControlConditions,
        ciphertext,
        dataToEncryptHash,
        chain: 'solana',
        sessionSigs,
      },
      this.litClient!
    );

    return decryptedString;
  }

  /**
   * Build store key instruction
   */
  async buildStoreKeyInstruction(
    owner: PublicKey,
    encryptedKey: Uint8Array,
    zkCommit: Uint8Array,
    mpcHash: Uint8Array,
    timestamp: number
  ): Promise<TransactionInstruction> {
    const [vaultPDA] = await this.deriveVaultPDA(owner);

    const instructionData = Buffer.alloc(201);
    instructionData.writeUInt8(INSTRUCTION.STORE_KEY, 0);
    instructionData.set(encryptedKey.slice(0, 128), 1);
    instructionData.set(zkCommit.slice(0, 32), 129);
    instructionData.set(mpcHash.slice(0, 32), 161);
    instructionData.writeBigUInt64LE(BigInt(timestamp), 193);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: false },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });
  }

  /**
   * Get vault from on-chain
   */
  async getVault(owner: PublicKey): Promise<Vault | null> {
    const [vaultPDA] = await this.deriveVaultPDA(owner);
    const accountInfo = await this.connection.getAccountInfo(vaultPDA);

    if (!accountInfo || accountInfo.data.length < VAULT_SIZE) {
      return null;
    }

    const data = accountInfo.data;

    return {
      discriminator: new Uint8Array(data.slice(0, 8)),
      owner: new PublicKey(data.slice(8, 40)),
      encryptedKey: new Uint8Array(data.slice(40, 168)),
      zkCommit: new Uint8Array(data.slice(168, 200)),
      mpcHash: new Uint8Array(data.slice(200, 232)),
      createdAt: Number(data.readBigUInt64LE(232)),
      accessFlags: data[240],
    };
  }

  /**
   * Check if vault exists
   */
  async vaultExists(owner: PublicKey): Promise<boolean> {
    const vault = await this.getVault(owner);
    return vault !== null;
  }
}
