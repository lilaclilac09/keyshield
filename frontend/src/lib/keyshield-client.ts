import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { getConnection } from './solana';
import { getProgramId } from './solana';
import { INSTRUCTION, VAULT_SEED, SHARE_SEED, VAULT_SIZE } from './constants';
import { Vault, StoreKeyParams, ShareKeyParams } from '@/types';

/**
 * Client SDK for interacting with KeyShield program
 */
export class KeyShieldClient {
  private connection: Connection;
  private programId: PublicKey;

  constructor(connection?: Connection, programId?: PublicKey) {
    this.connection = connection || getConnection();
    try {
      this.programId = programId || getProgramId();
    } catch {
      // Fallback to placeholder if not set
      this.programId = programId || new PublicKey('11111111111111111111111111111111');
    }
  }

  /**
   * Derive vault PDA for a given owner
   */
  async deriveVaultPDA(owner: PublicKey): Promise<[PublicKey, number]> {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(VAULT_SEED), owner.toBuffer()],
      this.programId
    );
    return [pda, bump];
  }

  /**
   * Derive share PDA for key sharing
   */
  async deriveSharePDA(vault: PublicKey, recipient: PublicKey): Promise<[PublicKey, number]> {
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(SHARE_SEED), vault.toBuffer(), recipient.toBuffer()],
      this.programId
    );
    return [pda, bump];
  }

  /**
   * Check if vault account exists and is initialized
   */
  async vaultAccountExists(owner: PublicKey): Promise<boolean> {
    const [vaultPDA] = await this.deriveVaultPDA(owner);
    const accountInfo = await this.connection.getAccountInfo(vaultPDA);
    
    if (!accountInfo) {
      return false; // Account doesn't exist
    }
    
    // Check if account is initialized (has discriminator)
    if (accountInfo.data.length >= 8) {
      const discriminator = accountInfo.data.slice(0, 8);
      // Check if it matches our discriminator "keyshld\0"
      const expectedDiscriminator = Buffer.from('keyshld\0');
      return discriminator.equals(expectedDiscriminator);
    }
    
    return false;
  }

  /**
   * Build store key instruction
   * Note: For PDAs, the account must be created by the program using invoke_signed
   * The program will create the account if it doesn't exist
   */
  async buildStoreKeyInstruction(
    owner: PublicKey,
    encryptedKey: Uint8Array,
    zkCommit: Uint8Array,
    mpcHash: Uint8Array,
    timestamp: number
  ): Promise<TransactionInstruction> {
    const [vaultPDA, bump] = await this.deriveVaultPDA(owner);

    // Instruction data layout:
    // discriminator (1) + encrypted_key (128) + zk_commit (32) + mpc_hash (32) + timestamp (8) = 201 bytes
    const instructionData = Buffer.alloc(201);
    instructionData.writeUInt8(INSTRUCTION.STORE_KEY, 0);
    instructionData.set(encryptedKey.slice(0, 128), 1);
    instructionData.set(zkCommit.slice(0, 32), 129);
    instructionData.set(mpcHash.slice(0, 32), 161);
    instructionData.writeBigUInt64LE(BigInt(timestamp), 193);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true }, // Owner needs to be writable to pay for account creation
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });
  }

  /**
   * Build access key instruction
   */
  async buildAccessKeyInstruction(
    requester: PublicKey,
    vaultOwner: PublicKey,
    zkProof?: Uint8Array
  ): Promise<TransactionInstruction> {
    const [vaultPDA] = await this.deriveVaultPDA(vaultOwner);

    // Instruction data: discriminator (1) + optional zk_proof (variable)
    const proofData = zkProof || new Uint8Array(0);
    const instructionData = Buffer.alloc(1 + proofData.length);
    instructionData.writeUInt8(INSTRUCTION.ACCESS_KEY, 0);
    if (proofData.length > 0) {
      instructionData.set(proofData, 1);
    }

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: requester, isSigner: true, isWritable: false },
        { pubkey: vaultPDA, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });
  }

  /**
   * Build share key instruction
   */
  async buildShareKeyInstruction(
    owner: PublicKey,
    recipient: PublicKey,
    timeLock?: number
  ): Promise<TransactionInstruction> {
    const [vaultPDA] = await this.deriveVaultPDA(owner);
    const [sharePDA] = await this.deriveSharePDA(vaultPDA, recipient);

    // Instruction data: discriminator (1) + recipient (32) + time_lock (8) = 41 bytes
    const instructionData = Buffer.alloc(41);
    instructionData.writeUInt8(INSTRUCTION.SHARE_KEY, 0);
    instructionData.set(recipient.toBuffer(), 1);
    instructionData.writeBigUInt64LE(BigInt(timeLock || 0), 33);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: false },
        { pubkey: vaultPDA, isSigner: false, isWritable: false },
        { pubkey: sharePDA, isSigner: false, isWritable: true },
        { pubkey: recipient, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });
  }

  /**
   * Check if vault account exists
   */
  async vaultAccountExists(owner: PublicKey): Promise<boolean> {
    const [vaultPDA] = await this.deriveVaultPDA(owner);
    const accountInfo = await this.connection.getAccountInfo(vaultPDA);
    return accountInfo !== null;
  }

  /**
   * Fetch vault data from on-chain
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
}
