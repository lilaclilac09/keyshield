"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEV_PRIVATE_KEY = exports.SIWE_URI_PREFIX = exports.FALLBACK_IPFS_GATEWAYS = exports.LOG_LEVEL = exports.LIT_NAMESPACE = exports.LIT_RECAP_ABILITY = exports.LIT_ABILITY = exports.LIT_RESOURCE_PREFIX = exports.STAKING_STATES = exports.AUTH_METHOD_SCOPE = exports.AUTH_METHOD_TYPE = exports.LIT_NETWORKS = exports.LOCAL_STORAGE_KEYS = exports.ALL_LIT_CHAINS = exports.LIT_COSMOS_CHAINS = exports.LIT_SVM_CHAINS = exports.CENTRALISATION_BY_NETWORK = exports.HTTP_BY_NETWORK = exports.HTTPS = exports.HTTP = exports.METAMASK_CHAIN_INFO_BY_NETWORK = exports.RELAYER_URL_BY_NETWORK = exports.RPC_URL_BY_NETWORK = exports.LIT_NETWORK = exports.LIT_EVM_CHAINS = exports.LIT_RPC = exports.METAMASK_CHAIN_INFO = exports.LIT_CHAINS = exports.LIT_COSMOS_CHAINS_KEYS = exports.LIT_SVM_CHAINS_KEYS = exports.LIT_CHAINS_KEYS = exports.LIT_AUTH_SIG_CHAIN_KEYS = exports.NETWORK_PUB_KEY = exports.VMTYPE = void 0;
// ========== Chains ==========
exports.VMTYPE = {
    EVM: 'EVM',
    SVM: 'SVM',
    CVM: 'CVM',
};
/**
 * Lit Protocol Network Public Key
 */
exports.NETWORK_PUB_KEY = '9971e835a1fe1a4d78e381eebbe0ddc84fde5119169db816900de796d10187f3c53d65c1202ac083d099a517f34a9b62';
// you can either pass a "chain" param to lit functions, which it uses to tell which network your sig came from.
// or, you can pass a authSig that has and of these keys in it to tell which network your sig came from.
exports.LIT_AUTH_SIG_CHAIN_KEYS = [
    'ethereum',
    'solana',
    'cosmos',
    'kyve',
];
const yellowstoneChain = {
    contractAddress: null,
    chainId: 175188,
    name: 'Chronicle Yellowstone - Lit Protocol Testnet',
    symbol: 'tstLPX',
    decimals: 18,
    rpcUrls: ['https://yellowstone-rpc.litprotocol.com/'],
    blockExplorerUrls: ['https://yellowstone-explorer.litprotocol.com/'],
    type: null,
    vmType: exports.VMTYPE.EVM,
};
exports.LIT_CHAINS_KEYS = [
    'ethereum',
    'polygon',
    'fantom',
    'xdai',
    'bsc',
    'arbitrum',
    'arbitrumSepolia',
    'avalanche',
    'fuji',
    'harmony',
    'mumbai',
    'goerli',
    'cronos',
    'optimism',
    'celo',
    'aurora',
    'eluvio',
    'alfajores',
    'xdc',
    'evmos',
    'evmosTestnet',
    'bscTestnet',
    'baseGoerli',
    'baseSepolia',
    'moonbeam',
    'moonriver',
    'moonbaseAlpha',
    'filecoin',
    'filecoinCalibrationTestnet',
    'hyperspace',
    'sepolia',
    'scrollSepolia',
    'scroll',
    'zksync',
    'base',
    'lukso',
    'luksoTestnet',
    'zora',
    'zoraGoerli',
    'zksyncTestnet',
    'lineaGoerli',
    'lineaSepolia',
    'yellowstone',
    'chiado',
    'zkEvm',
    'mantleTestnet',
    'mantle',
    'klaytn',
    'publicGoodsNetwork',
    'optimismGoerli',
    'waevEclipseTestnet',
    'waevEclipseDevnet',
    'verifyTestnet',
    'fuse',
    'campNetwork',
    'vanar',
    'lisk',
    'chilizMainnet',
    'chilizTestnet',
    'skaleTestnet',
    'skale',
    'skaleCalypso',
    'skaleCalypsoTestnet',
    'skaleEuropaTestnet',
    'skaleEuropa',
    'skaleTitanTestnet',
    'skaleTitan',
    'fhenixHelium',
    'hederaTestnet',
    'bitTorrentTestnet',
    'storyOdyssey',
    'campTestnet',
    'hushedNorthstar',
    'amoy',
    'matchain',
    'coreDao',
    'zkCandySepoliaTestnet',
    'vana',
];
exports.LIT_SVM_CHAINS_KEYS = [
    'solana',
    'solanaDevnet',
    'solanaTestnet',
];
exports.LIT_COSMOS_CHAINS_KEYS = [
    'cosmos',
    'kyve',
    'evmosCosmos',
    'evmosCosmosTestnet',
    'cheqdMainnet',
    'cheqdTestnet',
    'juno',
];
/**
 * EVM Chains supported by the LIT protocol.  Each chain includes an optional pre-deployed token contract that you may use for minting LITs.  These are ERC1155 contracts that let you mint any quantity of a given token.  Use the chain name as a key in this object.
 * @constant
 * @type { LITEVMChain }
 * @default
 */
exports.LIT_CHAINS = {
    ethereum: {
        contractAddress: '0xA54F7579fFb3F98bd8649fF02813F575f9b3d353',
        chainId: 1,
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
        type: 'ERC1155',
        rpcUrls: [
            'https://eth-mainnet.alchemyapi.io/v2/EuGnkVlzVoEkzdg0lpCarhm8YHOxWVxE',
        ],
        blockExplorerUrls: ['https://etherscan.io'],
        vmType: exports.VMTYPE.EVM,
    },
    polygon: {
        contractAddress: '0x7C7757a9675f06F3BE4618bB68732c4aB25D2e88',
        chainId: 137,
        name: 'Polygon',
        symbol: 'MATIC',
        decimals: 18,
        rpcUrls: ['https://polygon-rpc.com'],
        blockExplorerUrls: ['https://explorer.matic.network'],
        type: 'ERC1155',
        vmType: exports.VMTYPE.EVM,
    },
    fantom: {
        contractAddress: '0x5bD3Fe8Ab542f0AaBF7552FAAf376Fd8Aa9b3869',
        chainId: 250,
        name: 'Fantom',
        symbol: 'FTM',
        decimals: 18,
        rpcUrls: ['https://rpcapi.fantom.network'],
        blockExplorerUrls: ['https://ftmscan.com'],
        type: 'ERC1155',
        vmType: exports.VMTYPE.EVM,
    },
    xdai: {
        contractAddress: '0xDFc2Fd83dFfD0Dafb216F412aB3B18f2777406aF',
        chainId: 100,
        name: 'xDai',
        symbol: 'xDai',
        decimals: 18,
        rpcUrls: ['https://rpc.gnosischain.com'],
        blockExplorerUrls: [' https://blockscout.com/xdai/mainnet'],
        type: 'ERC1155',
        vmType: exports.VMTYPE.EVM,
    },
    bsc: {
        contractAddress: '0xc716950e5DEae248160109F562e1C9bF8E0CA25B',
        chainId: 56,
        name: 'Binance Smart Chain',
        symbol: 'BNB',
        decimals: 18,
        rpcUrls: ['https://bsc-dataseed.binance.org/'],
        blockExplorerUrls: [' https://bscscan.com/'],
        type: 'ERC1155',
        vmType: exports.VMTYPE.EVM,
    },
    arbitrum: {
        contractAddress: '0xc716950e5DEae248160109F562e1C9bF8E0CA25B',
        chainId: 42161,
        name: 'Arbitrum',
        symbol: 'AETH',
        decimals: 18,
        type: 'ERC1155',
        rpcUrls: ['https://arb1.arbitrum.io/rpc'],
        blockExplorerUrls: ['https://arbiscan.io/'],
        vmType: exports.VMTYPE.EVM,
    },
    arbitrumSepolia: {
        contractAddress: null,
        chainId: 421614,
        name: 'Arbitrum Sepolia',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
        blockExplorerUrls: ['https://sepolia.arbiscan.io/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    avalanche: {
        contractAddress: '0xBB118507E802D17ECDD4343797066dDc13Cde7C6',
        chainId: 43114,
        name: 'Avalanche',
        symbol: 'AVAX',
        decimals: 18,
        type: 'ERC1155',
        rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
        blockExplorerUrls: ['https://snowtrace.io/'],
        vmType: exports.VMTYPE.EVM,
    },
    fuji: {
        contractAddress: '0xc716950e5DEae248160109F562e1C9bF8E0CA25B',
        chainId: 43113,
        name: 'Avalanche FUJI Testnet',
        symbol: 'AVAX',
        decimals: 18,
        type: 'ERC1155',
        rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'],
        blockExplorerUrls: ['https://testnet.snowtrace.io/'],
        vmType: exports.VMTYPE.EVM,
    },
    harmony: {
        contractAddress: '0xBB118507E802D17ECDD4343797066dDc13Cde7C6',
        chainId: 1666600000,
        name: 'Harmony',
        symbol: 'ONE',
        decimals: 18,
        type: 'ERC1155',
        rpcUrls: ['https://api.harmony.one'],
        blockExplorerUrls: ['https://explorer.harmony.one/'],
        vmType: exports.VMTYPE.EVM,
    },
    mumbai: {
        contractAddress: '0xc716950e5DEae248160109F562e1C9bF8E0CA25B',
        chainId: 80001,
        name: 'Mumbai',
        symbol: 'MATIC',
        decimals: 18,
        rpcUrls: [
            'https://rpc-mumbai.maticvigil.com/v1/96bf5fa6e03d272fbd09de48d03927b95633726c',
        ],
        blockExplorerUrls: ['https://mumbai.polygonscan.com'],
        type: 'ERC1155',
        vmType: exports.VMTYPE.EVM,
    },
    goerli: {
        contractAddress: '0xc716950e5DEae248160109F562e1C9bF8E0CA25B',
        chainId: 5,
        name: 'Goerli',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://goerli.infura.io/v3/96dffb3d8c084dec952c61bd6230af34'],
        blockExplorerUrls: ['https://goerli.etherscan.io'],
        type: 'ERC1155',
        vmType: exports.VMTYPE.EVM,
    },
    cronos: {
        contractAddress: '0xc716950e5DEae248160109F562e1C9bF8E0CA25B',
        chainId: 25,
        name: 'Cronos',
        symbol: 'CRO',
        decimals: 18,
        rpcUrls: ['https://evm-cronos.org'],
        blockExplorerUrls: ['https://cronos.org/explorer/'],
        type: 'ERC1155',
        vmType: exports.VMTYPE.EVM,
    },
    optimism: {
        contractAddress: '0xbF68B4c9aCbed79278465007f20a08Fa045281E0',
        chainId: 10,
        name: 'Optimism',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://mainnet.optimism.io'],
        blockExplorerUrls: ['https://optimistic.etherscan.io'],
        type: 'ERC1155',
        vmType: exports.VMTYPE.EVM,
    },
    celo: {
        contractAddress: '0xBB118507E802D17ECDD4343797066dDc13Cde7C6',
        chainId: 42220,
        name: 'Celo',
        symbol: 'CELO',
        decimals: 18,
        rpcUrls: ['https://forno.celo.org'],
        blockExplorerUrls: ['https://explorer.celo.org'],
        type: 'ERC1155',
        vmType: exports.VMTYPE.EVM,
    },
    aurora: {
        contractAddress: null,
        chainId: 1313161554,
        name: 'Aurora',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://mainnet.aurora.dev'],
        blockExplorerUrls: ['https://aurorascan.dev'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    eluvio: {
        contractAddress: null,
        chainId: 955305,
        name: 'Eluvio',
        symbol: 'ELV',
        decimals: 18,
        rpcUrls: ['https://host-76-74-28-226.contentfabric.io/eth'],
        blockExplorerUrls: ['https://explorer.eluv.io'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    alfajores: {
        contractAddress: null,
        chainId: 44787,
        name: 'Alfajores',
        symbol: 'CELO',
        decimals: 18,
        rpcUrls: ['https://alfajores-forno.celo-testnet.org'],
        blockExplorerUrls: ['https://alfajores-blockscout.celo-testnet.org'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    xdc: {
        contractAddress: null,
        chainId: 50,
        name: 'XDC Blockchain',
        symbol: 'XDC',
        decimals: 18,
        rpcUrls: ['https://rpc.xinfin.network'],
        blockExplorerUrls: ['https://explorer.xinfin.network'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    evmos: {
        contractAddress: null,
        chainId: 9001,
        name: 'EVMOS',
        symbol: 'EVMOS',
        decimals: 18,
        rpcUrls: ['https://eth.bd.evmos.org:8545'],
        blockExplorerUrls: ['https://evm.evmos.org'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    evmosTestnet: {
        contractAddress: null,
        chainId: 9000,
        name: 'EVMOS Testnet',
        symbol: 'EVMOS',
        decimals: 18,
        rpcUrls: ['https://eth.bd.evmos.dev:8545'],
        blockExplorerUrls: ['https://evm.evmos.dev'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    bscTestnet: {
        contractAddress: null,
        chainId: 97,
        name: 'BSC Testnet',
        symbol: 'BNB',
        decimals: 18,
        rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
        blockExplorerUrls: ['https://testnet.bscscan.com/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    baseGoerli: {
        contractAddress: null,
        chainId: 84531,
        name: 'Base Goerli',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://goerli.base.org'],
        blockExplorerUrls: ['https://goerli.basescan.org'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    baseSepolia: {
        contractAddress: null,
        chainId: 84532,
        name: 'Base Sepolia',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://sepolia.base.org'],
        blockExplorerUrls: ['https://sepolia.basescan.org'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    moonbeam: {
        contractAddress: null,
        chainId: 1284,
        name: 'Moonbeam',
        symbol: 'GLMR',
        decimals: 18,
        rpcUrls: ['https://rpc.api.moonbeam.network'],
        blockExplorerUrls: ['https://moonscan.io'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    moonriver: {
        contractAddress: null,
        chainId: 1285,
        name: 'Moonriver',
        symbol: 'MOVR',
        decimals: 18,
        rpcUrls: ['https://rpc.api.moonriver.moonbeam.network'],
        blockExplorerUrls: ['https://moonriver.moonscan.io'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    moonbaseAlpha: {
        contractAddress: null,
        chainId: 1287,
        name: 'Moonbase Alpha',
        symbol: 'DEV',
        decimals: 18,
        rpcUrls: ['https://rpc.api.moonbase.moonbeam.network'],
        blockExplorerUrls: ['https://moonbase.moonscan.io/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    filecoin: {
        contractAddress: null,
        chainId: 314,
        name: 'Filecoin',
        symbol: 'FIL',
        decimals: 18,
        rpcUrls: ['https://api.node.glif.io/rpc/v1'],
        blockExplorerUrls: ['https://filfox.info/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    filecoinCalibrationTestnet: {
        contractAddress: null,
        chainId: 314159,
        name: 'Filecoin Calibration Testnet',
        symbol: 'tFIL',
        decimals: 18,
        rpcUrls: ['https://api.calibration.node.glif.io/rpc/v1'],
        blockExplorerUrls: ['https://calibration.filscan.io/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    hyperspace: {
        contractAddress: null,
        chainId: 3141,
        name: 'Filecoin Hyperspace testnet',
        symbol: 'tFIL',
        decimals: 18,
        rpcUrls: ['https://api.hyperspace.node.glif.io/rpc/v1'],
        blockExplorerUrls: ['https://hyperspace.filscan.io/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    sepolia: {
        contractAddress: null,
        chainId: 11155111,
        name: 'Sepolia Testnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
        blockExplorerUrls: ['https://sepolia.etherscan.io/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    scrollSepolia: {
        contractAddress: null,
        chainId: 534351,
        name: 'Scroll Sepolia Testnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://sepolia-rpc.scroll.io'],
        blockExplorerUrls: ['https://sepolia.scrollscan.com'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    scroll: {
        contractAddress: null,
        chainId: 534352,
        name: 'Scroll',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://rpc.scroll.io'],
        blockExplorerUrls: ['https://scrollscan.com/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    zksync: {
        contractAddress: null,
        chainId: 324,
        name: 'zkSync Era Mainnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://mainnet.era.zksync.io'],
        blockExplorerUrls: ['https://explorer.zksync.io/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    base: {
        contractAddress: null,
        chainId: 8453,
        name: 'Base Mainnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://mainnet.base.org'],
        blockExplorerUrls: ['https://basescan.org'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    lukso: {
        contractAddress: null,
        chainId: 42,
        name: 'Lukso',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://rpc.lukso.gateway.fm'],
        blockExplorerUrls: ['https://explorer.execution.mainnet.lukso.network/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    luksoTestnet: {
        contractAddress: null,
        chainId: 4201,
        name: 'Lukso Testnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://rpc.testnet.lukso.network'],
        blockExplorerUrls: ['https://explorer.execution.testnet.lukso.network'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    zora: {
        contractAddress: null,
        chainId: 7777777,
        name: '	Zora',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://rpc.zora.energy/'],
        blockExplorerUrls: ['https://explorer.zora.energy'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    zoraGoerli: {
        contractAddress: null,
        chainId: 999,
        name: 'Zora Goerli',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://testnet.rpc.zora.energy'],
        blockExplorerUrls: ['https://testnet.explorer.zora.energy'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    zksyncTestnet: {
        contractAddress: null,
        chainId: 280,
        name: 'zkSync Era Testnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://testnet.era.zksync.dev'],
        blockExplorerUrls: ['https://goerli.explorer.zksync.io/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    lineaGoerli: {
        contractAddress: null,
        chainId: 59140,
        name: 'Linea Testnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://rpc.goerli.linea.build'],
        blockExplorerUrls: ['https://explorer.goerli.linea.build'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    lineaSepolia: {
        contractAddress: null,
        chainId: 59141,
        name: 'Linea Sepolia Testnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://rpc.sepolia.linea.build'],
        blockExplorerUrls: ['https://explorer.sepolia.linea.build'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    /**
     * Use this for `>= Datil` network.
     * Chainlist entry for the Chronicle Yellowstone Testnet.
     * https://chainlist.org/chain/175188
     */
    yellowstone: yellowstoneChain,
    chiado: {
        contractAddress: null,
        chainId: 10200,
        name: 'Chiado',
        symbol: 'XDAI',
        decimals: 18,
        rpcUrls: ['https://rpc.chiadochain.net'],
        blockExplorerUrls: ['https://blockscout.chiadochain.net'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    zkEvm: {
        contractAddress: null,
        chainId: 1101,
        name: 'zkEvm',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://zkevm-rpc.com'],
        blockExplorerUrls: ['https://zkevm.polygonscan.com/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    mantleTestnet: {
        contractAddress: null,
        chainId: 5001,
        name: 'Mantle Testnet',
        symbol: 'MNT',
        decimals: 18,
        rpcUrls: ['https://rpc.testnet.mantle.xyz'],
        blockExplorerUrls: ['https://explorer.testnet.mantle.xyz/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    mantle: {
        contractAddress: null,
        chainId: 5000,
        name: 'Mantle',
        symbol: 'MNT',
        decimals: 18,
        rpcUrls: ['https://rpc.mantle.xyz'],
        blockExplorerUrls: ['https://explorer.mantle.xyz/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    klaytn: {
        contractAddress: null,
        chainId: 8217,
        name: 'Klaytn',
        symbol: 'KLAY',
        decimals: 18,
        rpcUrls: ['https://klaytn.blockpi.network/v1/rpc/public'],
        blockExplorerUrls: ['https://www.klaytnfinder.io/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    publicGoodsNetwork: {
        contractAddress: null,
        chainId: 424,
        name: 'Public Goods Network',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://rpc.publicgoods.network'],
        blockExplorerUrls: ['https://explorer.publicgoods.network/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    optimismGoerli: {
        contractAddress: null,
        chainId: 420,
        name: 'Optimism Goerli',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://optimism-goerli.publicnode.com'],
        blockExplorerUrls: ['https://goerli-optimism.etherscan.io/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    waevEclipseTestnet: {
        contractAddress: null,
        chainId: 91006,
        name: 'Waev Eclipse Testnet',
        symbol: 'ecWAEV',
        decimals: 18,
        rpcUrls: ['https://api.evm.waev.eclipsenetwork.xyz'],
        blockExplorerUrls: ['http://waev.explorer.modular.cloud/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    waevEclipseDevnet: {
        contractAddress: null,
        chainId: 91006,
        name: 'Waev Eclipse Devnet',
        symbol: 'ecWAEV',
        decimals: 18,
        rpcUrls: ['https://api.evm.waev.dev.eclipsenetwork.xyz'],
        blockExplorerUrls: ['http://waev.explorer.modular.cloud/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    verifyTestnet: {
        contractAddress: null,
        chainId: 1833,
        name: 'Verify Testnet',
        symbol: 'MATIC',
        decimals: 18,
        rpcUrls: ['https://rpc.verify-testnet.gelato.digital'],
        blockExplorerUrls: ['https://verify-testnet.blockscout.com/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    fuse: {
        contractAddress: null,
        chainId: 122,
        name: 'Fuse',
        symbol: 'FUSE',
        decimals: 18,
        rpcUrls: ['https://rpc.fuse.io/'],
        blockExplorerUrls: ['https://explorer.fuse.io/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    campNetwork: {
        contractAddress: null,
        chainId: 325000,
        name: 'Camp Network',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://rpc.camp-network-testnet.gelato.digital'],
        blockExplorerUrls: [
            'https://explorer.camp-network-testnet.gelato.digital/',
        ],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    vanar: {
        contractAddress: null,
        chainId: 78600,
        name: 'Vanar Vanguard',
        symbol: 'VANRY',
        decimals: 18,
        rpcUrls: ['https://rpc-vanguard.vanarchain.com'],
        blockExplorerUrls: ['https://explorer-vanguard.vanarchain.com'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    lisk: {
        contractAddress: null,
        chainId: 1135,
        name: 'Lisk',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://lisk.drpc.org'],
        blockExplorerUrls: ['https://blockscout.lisk.com/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    chilizMainnet: {
        contractAddress: null,
        chainId: 88888,
        name: 'Chiliz Mainnet',
        symbol: 'CHZ',
        decimals: 18,
        rpcUrls: ['https://rpc.ankr.com/chiliz'],
        blockExplorerUrls: ['https://chiliscan.com/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    chilizTestnet: {
        contractAddress: null,
        chainId: 88882,
        name: 'Chiliz Spicy Testnet',
        symbol: 'CHZ',
        decimals: 18,
        rpcUrls: ['https://spicy-rpc.chiliz.com/'],
        blockExplorerUrls: ['https://testnet.chiliscan.com/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    skaleTestnet: {
        contractAddress: null,
        chainId: 37084624,
        name: 'SKALE Nebula Hub Testnet',
        symbol: 'sFUEL',
        decimals: 18,
        rpcUrls: ['https://testnet.skalenodes.com/v1/lanky-ill-funny-testnet'],
        blockExplorerUrls: [
            'https://lanky-ill-funny-testnet.explorer.testnet.skalenodes.com',
        ],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    skale: {
        contractAddress: null,
        chainId: 1482601649,
        name: 'SKALE Nebula Hub Mainnet',
        symbol: 'sFUEL',
        decimals: 18,
        rpcUrls: ['https://mainnet.skalenodes.com/v1/green-giddy-denebola'],
        blockExplorerUrls: [
            'https://green-giddy-denebola.explorer.mainnet.skalenodes.com',
        ],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    skaleCalypso: {
        contractAddress: null,
        chainId: 1564830818,
        name: 'SKALE Calypso Hub Mainnet',
        symbol: 'sFUEL',
        decimals: 18,
        rpcUrls: ['https://mainnet.skalenodes.com/v1/honorable-steel-rasalhague'],
        blockExplorerUrls: [
            'https://giant-half-dual-testnet.explorer.testnet.skalenodes.com/',
        ],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    skaleCalypsoTestnet: {
        contractAddress: null,
        chainId: 974399131,
        name: 'SKALE Calypso Hub Testnet',
        symbol: 'sFUEL',
        decimals: 18,
        rpcUrls: ['https://testnet.skalenodes.com/v1/giant-half-dual-testnet'],
        blockExplorerUrls: [
            'https://giant-half-dual-testnet.explorer.testnet.skalenodes.com/',
        ],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    skaleEuropa: {
        contractAddress: null,
        chainId: 2046399126,
        name: 'SKALE Europa DeFI Hub',
        symbol: 'sFUEL',
        decimals: 18,
        rpcUrls: ['https://mainnet.skalenodes.com/v1/elated-tan-skat'],
        blockExplorerUrls: [
            'https://elated-tan-skat.explorer.mainnet.skalenodes.com/',
        ],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    skaleEuropaTestnet: {
        contractAddress: null,
        chainId: 1444673419,
        name: 'SKALE Europa DeFi Hub Testnet',
        symbol: 'sFUEL',
        decimals: 18,
        rpcUrls: ['https://testnet.skalenodes.com/v1/juicy-low-small-testnet'],
        blockExplorerUrls: [
            'https://juicy-low-small-testnet.explorer.testnet.skalenodes.com/',
        ],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    skaleTitan: {
        contractAddress: null,
        chainId: 1350216234,
        name: 'SKALE Titan AI Hub',
        symbol: 'sFUEL',
        decimals: 18,
        rpcUrls: ['https://mainnet.skalenodes.com/v1/parallel-stormy-spica'],
        blockExplorerUrls: [
            'https://parallel-stormy-spica.explorer.mainnet.skalenodes.com/',
        ],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    skaleTitanTestnet: {
        contractAddress: null,
        chainId: 1020352220,
        name: 'SKALE Titan AI Hub Testnet',
        symbol: 'sFUEL',
        decimals: 18,
        rpcUrls: ['https://testnet.skalenodes.com/v1/aware-fake-trim-testnet'],
        blockExplorerUrls: [
            'https://aware-fake-trim-testnet.explorer.testnet.skalenodes.com/',
        ],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    fhenixHelium: {
        contractAddress: null,
        chainId: 8008135,
        name: 'Fhenix Helium',
        symbol: 'tFHE',
        decimals: 18,
        rpcUrls: ['https://api.helium.fhenix.zone'],
        blockExplorerUrls: ['https://explorer.helium.fhenix.zone'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    hederaTestnet: {
        contractAddress: null,
        chainId: 296,
        name: 'Hedera Testnet',
        symbol: 'HBAR',
        decimals: 8,
        rpcUrls: ['https://testnet.hashio.io/api'],
        blockExplorerUrls: ['https://hashscan.io/testnet/dashboard'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    bitTorrentTestnet: {
        contractAddress: null,
        chainId: 1028,
        name: 'BitTorrent Testnet',
        symbol: 'BTT',
        decimals: 18,
        rpcUrls: ['https://test-rpc.bittorrentchain.io'],
        blockExplorerUrls: ['https://testnet.bttcscan.com'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    storyOdyssey: {
        contractAddress: null,
        chainId: 1516,
        name: 'Story Odyssey',
        symbol: 'IP',
        decimals: 18,
        rpcUrls: ['https://rpc.odyssey.storyrpc.io'],
        blockExplorerUrls: ['https://odyssey.storyscan.xyz'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    campTestnet: {
        contractAddress: null,
        chainId: 325000,
        name: 'Camp Testnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://rpc.camp-network-testnet.gelato.digital'],
        blockExplorerUrls: ['https://camp-network-testnet.blockscout.com'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    hushedNorthstar: {
        contractAddress: null,
        chainId: 42161,
        name: 'Hushed Northstar Devnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://rpc.buildbear.io/yielddev'],
        blockExplorerUrls: ['https://explorer.buildbear.io/yielddev/transactions'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    amoy: {
        contractAddress: null,
        chainId: 80002,
        name: 'Amoy',
        symbol: 'POL',
        decimals: 18,
        rpcUrls: ['https://rpc-amoy.polygon.technology'],
        blockExplorerUrls: ['https://amoy.polygonscan.com'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    matchain: {
        contractAddress: null,
        chainId: 698,
        name: 'Matchain',
        symbol: 'BNB',
        decimals: 18,
        rpcUrls: ['https://rpc.matchain.io'],
        blockExplorerUrls: ['https://matchscan.io'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    coreDao: {
        contractAddress: null,
        chainId: 1116,
        name: 'Core DAO',
        symbol: 'CORE',
        decimals: 18,
        rpcUrls: ['https://rpc.coredao.org'],
        blockExplorerUrls: ['https://scan.coredao.org/'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    zkCandySepoliaTestnet: {
        contractAddress: null,
        chainId: 302,
        name: 'ZKcandy Sepolia Testnet',
        symbol: 'ETH',
        decimals: 18,
        rpcUrls: ['https://sepolia.rpc.zkcandy.io'],
        blockExplorerUrls: ['https://sepolia.explorer.zkcandy.io'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
    vana: {
        contractAddress: null,
        chainId: 1480,
        name: 'Vana',
        symbol: 'VANA',
        decimals: 18,
        rpcUrls: ['https://rpc.vana.org'],
        blockExplorerUrls: ['https://vanascan.io'],
        type: null,
        vmType: exports.VMTYPE.EVM,
    },
};
/**
 * Object containing information to submit to Metamask
 */
exports.METAMASK_CHAIN_INFO = {
    /**
     * Information about the "chronicleYellowstone" chain.
     */
    yellowstone: {
        chainId: exports.LIT_CHAINS['yellowstone'].chainId,
        chainName: exports.LIT_CHAINS['yellowstone'].name,
        nativeCurrency: {
            name: exports.LIT_CHAINS['yellowstone'].symbol,
            symbol: exports.LIT_CHAINS['yellowstone'].symbol,
            decimals: exports.LIT_CHAINS['yellowstone'].decimals,
        },
        rpcUrls: exports.LIT_CHAINS['yellowstone'].rpcUrls,
        blockExplorerUrls: exports.LIT_CHAINS['yellowstone'].blockExplorerUrls,
        iconUrls: ['future'],
    },
};
/**
 * Constants representing the available LIT RPC endpoints.
 */
exports.LIT_RPC = {
    /**
     * Local Anvil RPC endpoint.
     */
    LOCAL_ANVIL: 'http://127.0.0.1:8545',
    /**
     * Chronicle Yellowstone RPC endpoint - used for >= Datil-test
     * More info: https://app.conduit.xyz/published/view/chronicle-yellowstone-testnet-9qgmzfcohk
     */
    CHRONICLE_YELLOWSTONE: 'https://yellowstone-rpc.litprotocol.com',
};
exports.LIT_EVM_CHAINS = exports.LIT_CHAINS;
/**
 * Represents the Lit Network constants.
 */
exports.LIT_NETWORK = {
    NagaDev: 'naga-dev',
    Custom: 'custom',
};
/**
 * RPC URL by Network
 *
 * A mapping of network names to their corresponding RPC URLs.
 */
exports.RPC_URL_BY_NETWORK = {
    [exports.LIT_NETWORK.NagaDev]: exports.LIT_RPC.CHRONICLE_YELLOWSTONE,
    [exports.LIT_NETWORK.Custom]: exports.LIT_RPC.LOCAL_ANVIL,
};
/**
 * Mapping of network names to their corresponding relayer URLs.
 * @deprecated - use naga doesn't use these urls anymore.
 */
exports.RELAYER_URL_BY_NETWORK = {
    [exports.LIT_NETWORK.NagaDev]: 'https://naga-dev-relayer.getlit.dev',
    [exports.LIT_NETWORK.Custom]: 'http://localhost:3000',
};
/**
 * Mapping of network values to corresponding Metamask chain info.
 */
exports.METAMASK_CHAIN_INFO_BY_NETWORK = {
    [exports.LIT_NETWORK.NagaDev]: exports.METAMASK_CHAIN_INFO.yellowstone,
    [exports.LIT_NETWORK.Custom]: exports.METAMASK_CHAIN_INFO.yellowstone,
};
exports.HTTP = 'http://';
exports.HTTPS = 'https://';
/**
 * Mapping of network values to corresponding http protocol.
 */
exports.HTTP_BY_NETWORK = {
    [exports.LIT_NETWORK.NagaDev]: exports.HTTPS,
    [exports.LIT_NETWORK.Custom]: exports.HTTP, // default, can be changed by config
};
/**
 * Mapping of network values to their corresponding centralisation status.
 */
exports.CENTRALISATION_BY_NETWORK = {
    [exports.LIT_NETWORK.NagaDev]: 'centralised',
    [exports.LIT_NETWORK.Custom]: 'unknown',
};
/**
 * Solana Chains supported by the LIT protocol.  Use the chain name as a key in this object.
 * @constant
 * @type { LITSVMChain }
 * @default
 */
exports.LIT_SVM_CHAINS = {
    solana: {
        name: 'Solana',
        symbol: 'SOL',
        decimals: 9,
        rpcUrls: ['https://api.mainnet-beta.solana.com'],
        blockExplorerUrls: ['https://explorer.solana.com/'],
        vmType: exports.VMTYPE.SVM,
    },
    solanaDevnet: {
        name: 'Solana Devnet',
        symbol: 'SOL',
        decimals: 9,
        rpcUrls: ['https://api.devnet.solana.com'],
        blockExplorerUrls: ['https://explorer.solana.com/'],
        vmType: exports.VMTYPE.SVM,
    },
    solanaTestnet: {
        name: 'Solana Testnet',
        symbol: 'SOL',
        decimals: 9,
        rpcUrls: ['https://api.testnet.solana.com'],
        blockExplorerUrls: ['https://explorer.solana.com/'],
        vmType: exports.VMTYPE.SVM,
    },
};
/**
 * Cosmos Chains supported by the LIT protocol.  Use the chain name as a key in this object.
 * @constant
 * @type { LITCosmosChain }
 * @default
 */
exports.LIT_COSMOS_CHAINS = {
    cosmos: {
        name: 'Cosmos',
        symbol: 'ATOM',
        decimals: 6,
        chainId: 'cosmoshub-4',
        rpcUrls: ['https://lcd-cosmoshub.keplr.app'],
        blockExplorerUrls: ['https://atomscan.com/'],
        vmType: exports.VMTYPE.CVM,
    },
    kyve: {
        name: 'Kyve',
        symbol: 'KYVE',
        decimals: 6,
        chainId: 'korellia',
        rpcUrls: ['https://api.korellia.kyve.network'],
        blockExplorerUrls: ['https://explorer.kyve.network/'],
        vmType: exports.VMTYPE.CVM,
    },
    evmosCosmos: {
        name: 'EVMOS Cosmos',
        symbol: 'EVMOS',
        decimals: 18,
        chainId: 'evmos_9001-2',
        rpcUrls: ['https://rest.bd.evmos.org:1317'],
        blockExplorerUrls: ['https://evmos.bigdipper.live'],
        vmType: exports.VMTYPE.CVM,
    },
    evmosCosmosTestnet: {
        name: 'Evmos Cosmos Testnet',
        symbol: 'EVMOS',
        decimals: 18,
        chainId: 'evmos_9000-4',
        rpcUrls: ['https://rest.bd.evmos.dev:1317'],
        blockExplorerUrls: ['https://testnet.bigdipper.live'],
        vmType: exports.VMTYPE.CVM,
    },
    cheqdMainnet: {
        name: 'Cheqd Mainnet',
        symbol: 'CHEQ',
        decimals: 9,
        chainId: 'cheqd-mainnet-1',
        rpcUrls: ['https://api.cheqd.net'],
        blockExplorerUrls: ['https://explorer.cheqd.io'],
        vmType: exports.VMTYPE.CVM,
    },
    cheqdTestnet: {
        name: 'Cheqd Testnet',
        symbol: 'CHEQ',
        decimals: 9,
        chainId: 'cheqd-testnet-6',
        rpcUrls: ['https://api.cheqd.network'],
        blockExplorerUrls: ['https://testnet-explorer.cheqd.io'],
        vmType: exports.VMTYPE.CVM,
    },
    juno: {
        name: 'Juno',
        symbol: 'JUNO',
        decimals: 6,
        chainId: 'juno-1',
        rpcUrls: ['https://rest.cosmos.directory/juno'],
        blockExplorerUrls: ['https://www.mintscan.io/juno'],
        vmType: exports.VMTYPE.CVM,
    },
};
/**
 * All Chains supported by the LIT protocol.  Use the chain name as a key in this object.
 */
exports.ALL_LIT_CHAINS = {
    ...exports.LIT_CHAINS,
    ...exports.LIT_SVM_CHAINS,
    ...exports.LIT_COSMOS_CHAINS,
};
/**
 * Local storage key constants
 */
exports.LOCAL_STORAGE_KEYS = {
    AUTH_SIGNATURE: 'lit-auth-signature',
    WEB3_PROVIDER: 'lit-web3-provider',
    SESSION_KEY: 'lit-session-key',
    WALLET_SIGNATURE: 'lit-wallet-sig',
};
/**
 * Default node URLs for each LIT network
 * Note: Dynamic networks have no default node URLS; they are always
 * loaded from the chain during initialization
 */
exports.LIT_NETWORKS = {
    [exports.LIT_NETWORK.NagaDev]: [],
    [exports.LIT_NETWORK.Custom]: [],
};
// ========== Supported PKP Auth Method Types ==========
exports.AUTH_METHOD_TYPE = {
    EthWallet: 1,
    LitAction: 2,
    WebAuthn: 3,
    Discord: 4,
    Google: 5,
    GoogleJwt: 6,
    AppleJwt: 8,
    StytchOtp: 9,
    StytchEmailFactorOtp: 10,
    StytchSmsFactorOtp: 11,
    StytchWhatsAppFactorOtp: 12,
    StytchTotpFactorOtp: 13,
};
// ========== Supported PKP Auth Method Scopes ==========
exports.AUTH_METHOD_SCOPE = {
    NoPermissions: 0,
    SignAnything: 1,
    PersonalSign: 2,
};
// ========== Supported Staking States ==========
exports.STAKING_STATES = {
    Active: 0,
    NextValidatorSetLocked: 1,
    ReadyForNextEpoch: 2,
    Unlocked: 3,
    Paused: 4,
    Restore: 5,
};
/**
 * Prefixes used for identifying various LIT resources.
 *
 * @description These resource prefixes are also used as valid IRI schemes.
 */
exports.LIT_RESOURCE_PREFIX = {
    AccessControlCondition: 'lit-accesscontrolcondition',
    PKP: 'lit-pkp',
    RLI: 'lit-ratelimitincrease',
    PaymentDelegation: 'lit-paymentdelegation',
    LitAction: 'lit-litaction',
};
/**
 * User-facing abilities that can be granted to a session.
 */
exports.LIT_ABILITY = {
    /**
     * This is the ability to process an encryption access control condition.
     * The resource will specify the corresponding hashed key value of the
     * access control condition.
     */
    AccessControlConditionDecryption: 'access-control-condition-decryption',
    /**
     * This is the ability to process a signing access control condition.
     * The resource will specify the corresponding hashed key value of the
     * access control condition.
     */
    AccessControlConditionSigning: 'access-control-condition-signing',
    /**
     * This is the ability to use a PKP for signing purposes. The resource will specify
     * the corresponding PKP token ID.
     */
    PKPSigning: 'pkp-signing',
    /**
     * This is the ability to use Payment Delegation
     */
    PaymentDelegation: 'lit-payment-delegation',
    /**
     * This is the ability to execute a Lit Action. The resource will specify the
     * corresponding Lit Action IPFS CID.
     */
    LitActionExecution: 'lit-action-execution',
};
/**
 * LIT specific abilities mapped into the Recap specific terminology
 * of an 'ability'.
 */
exports.LIT_RECAP_ABILITY = {
    Decryption: 'Decryption',
    Signing: 'Signing',
    Auth: 'Auth',
    Execution: 'Execution',
};
exports.LIT_NAMESPACE = {
    Auth: 'Auth',
    Threshold: 'Threshold',
};
/**
 * SDK Logger levels
 */
exports.LOG_LEVEL = {
    INFO: 0,
    DEBUG: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4,
    TIMING_START: 5,
    TIMING_END: 6,
    OFF: -1,
};
/**
 * This is useful when the node is not able to connect to the IPFS gateway,
 * so the sdk can fall back to these gateways.
 */
exports.FALLBACK_IPFS_GATEWAYS = [
    'https://flk-ipfs.io/ipfs/',
    'https://litprotocol.mypinata.cloud/ipfs/',
];
exports.SIWE_URI_PREFIX = {
    SESSION_KEY: 'lit:session:',
    DELEGATION: 'lit:capability:delegation',
};
exports.DEV_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
//# sourceMappingURL=constants.js.map