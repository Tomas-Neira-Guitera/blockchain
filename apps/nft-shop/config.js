// Redes conocidas (solo para mostrar el nombre, el explorador y poder cambiar de red).
// Las direcciones de los contratos se ingresan desde la interfaz.
export const NETWORKS = {
	31337: {
		name: "Hardhat local",
		explorer: null,
		// Datos para que MetaMask agregue la red si no la tiene
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
	},
};

// ABI mínimo del ERC-20 (estándar, no hace falta tocarlo)
export const ERC20_ABI = [
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",
	"function balanceOf(address) view returns (uint256)",
	"function allowance(address owner, address spender) view returns (uint256)",
	"function approve(address spender, uint256 amount) returns (bool)",
];

// - PRICE_FN: función view que devuelve el precio en unidades del ERC-20
// - BUY_FN:   función que cobra el ERC-20 al comprador (vía transferFrom) y le mintea el NFT
export const PRICE_FN = "price";
export const BUY_FN = "buy";
export const NFT_ABI = [
	"function name() view returns (string)",
	"function balanceOf(address) view returns (uint256)",
	`function ${PRICE_FN}() view returns (uint256)`,
	`function ${BUY_FN}()`,
];
