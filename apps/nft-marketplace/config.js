// Redes conocidas. La dirección del marketplace se puede dejar precargada acá (marketplace)
// o ingresarla desde la interfaz. knownTokens aparecen como sugerencia al vender.
export const NETWORKS = {
  31337: {
    name: "Hardhat local",
    explorer: null,
    marketplace: "",
    knownTokens: [],
    addParams: {
      chainId: "0x7a69",
      chainName: "Hardhat local",
      rpcUrls: ["http://127.0.0.1:8545"],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
  },
  11155111: {
    name: "Sepolia",
    explorer: "https://sepolia.etherscan.io",
    marketplace: "", // pegá acá la dirección después de desplegar Marketplace.sol
    knownTokens: [{ symbol: "MC", address: "0xc9264836CE2867D830Ee941686b18006e4F3Ced8" }],
  },
};

export const MARKET_ABI = [
  "function list(address nft, uint256 tokenId, address token, uint96 price) returns (uint256)",
  "function buy(uint256 id)",
  "function cancel(uint256 id)",
  "function getListings() view returns (tuple(address seller, uint96 price, address nft, address token, uint256 tokenId)[])",
];

export const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export const ERC721_ABI = [
  "function name() view returns (string)",
  "function ownerOf(uint256) view returns (address)",
  "function getApproved(uint256) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function approve(address to, uint256 tokenId)",
];
