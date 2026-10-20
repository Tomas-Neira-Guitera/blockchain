// Esta DAO funciona solo en la red de prueba Sepolia.
export const NETWORK = {
  chainId: 11155111,
  name: "Sepolia",
  explorer: "https://sepolia.etherscan.io",
  dao: "0xFD4ffA161d6232c00A39fC394b77c8D5aa8Fa1df", // CentroEstudiantesDAO.sol desplegado
  // Por si MetaMask no tiene Sepolia configurada
  addParams: {
    chainId: "0xaa36a7",
    chainName: "Sepolia",
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
};

export const DAO_ABI = [
  "function admin() view returns (address)",
  "function esEstudiante(address) view returns (bool)",
  "function registradoEn(address) view returns (uint256)",
  "function totalEstudiantes() view returns (uint256)",
  "function cantidadPropuestas() view returns (uint256)",
  "function propuestas(uint256) view returns (string titulo, string descripcion, address creador, uint256 inicio, uint256 fin, uint256 padron, uint256 votosSi, uint256 votosNo, uint8 estado)",
  "function yaVoto(uint256, address) view returns (bool)",
  "function agregarEstudiantes(address[] lista)",
  "function quitarEstudiante(address e)",
  "function crearPropuesta(string titulo, string descripcion, uint256 duracionSegundos) returns (uint256)",
  "function votar(uint256 id, bool aFavor)",
  "function ejecutar(uint256 id)",
];
