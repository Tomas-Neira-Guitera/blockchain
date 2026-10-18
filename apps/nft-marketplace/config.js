// Este marketplace funciona solo en la red de prueba Sepolia.
export const NETWORK = {
  chainId: 11155111,
  name: "Sepolia",
  explorer: "https://sepolia.etherscan.io",
  marketplace: "0x3D1D8B52D5957848AC1a9064a0a8F018223d9C86", // Marketplace.sol desplegado
  knownTokens: [{ symbol: "MC", address: "0xc9264836CE2867D830Ee941686b18006e4F3Ced8" }], // sugerencias al vender
  // Por si MetaMask no tiene Sepolia configurada
  addParams: {
    chainId: "0xaa36a7",
    chainName: "Sepolia",
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
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
