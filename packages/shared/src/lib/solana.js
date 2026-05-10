// Solana helpers: PDA derivation, ATA, tx builder, explorer URL
// Uses @solana/web3.js v2 patterns
export const APS_SEED = 'keyshield_mpp';
export function getProgramId() {
    return import.meta?.env?.VITE_KEYSHIELD_PROGRAM_ID ?? 'KSHELdPR0GRAM1Dxxxxxxxxxxxxxxxxxxxxxx';
}
export function derivePda(seeds, programId) {
    // Simplified PDA derivation – in production uses @solana/web3.js v2 findProgramAddressSync
    // This is a placeholder that returns a deterministic address
    const allSeeds = new Uint8Array(seeds.reduce((a, b) => a + b.length, 0));
    let offset = 0;
    for (const seed of seeds) {
        allSeeds.set(seed, offset);
        offset += seed.length;
    }
    // In real implementation: PublicKey.findProgramAddressSync(seeds, new PublicKey(programId))
    return { key: `PDA_${btoa(String.fromCharCode(...allSeeds.slice(0, 8)))}`, bump: 0 };
}
export function buildExplorerUrl(txSig, cluster = 'mainnet') {
    return `https://explorer.solana.com/tx/${txSig}?cluster=${cluster === 'mainnet' ? '' : cluster}`;
}
export function buildOpenTxParams(streamAddress, amountLamports) {
    return {
        stream_address: streamAddress,
        amount_lamports: amountLamports.toString(),
        instruction: 'open_stream',
    };
}
export function solToLamports(sol) {
    return BigInt(Math.floor(sol * 1e9));
}
export function lamportsToSol(lamports) {
    return Number(lamports) / 1e9;
}
export function shortAddress(addr, chars = 4) {
    if (addr.length <= chars * 2 + 3)
        return addr;
    return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}
//# sourceMappingURL=solana.js.map