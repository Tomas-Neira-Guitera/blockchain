# NFT Shop

Dapp mínima para comprar un ERC-721 pagando con un ERC-20. Login con MetaMask y ethers.js v6 (cargado por CDN, sin build).

## Flujo
1. **Conectar MetaMask** → pide la cuenta del usuario y detecta la red.
2. **Cargar contratos** → se ingresan las direcciones del ERC-20 y del ERC-721 en la interfaz. Se validan (formato y que haya un contrato en esa red) y quedan guardadas en el navegador por red.
3. **Comprar NFT** → se paga con los tokens de la cuenta conectada: si el allowance no alcanza, hace `approve(nft, precio)` en el ERC-20; después llama a la función de compra del ERC-721, que cobra con `transferFrom` y le mintea el NFT al comprador. El botón se deshabilita si el saldo no alcanza.

## Configuración
Editá `config.js`:
- `NETWORKS`: redes conocidas (nombre, explorador y datos para agregarlas a MetaMask). Las direcciones de los contratos ya no van acá, se cargan desde la interfaz.
- `PRICE_FN` / `BUY_FN`: nombres de las funciones de precio y compra de tu ERC-721.

## Correr
MetaMask no funciona con páginas abiertas como `file://`, así que hay que servirla:

```bash
cd apps/nft-shop
npx serve .            # o: python -m http.server 8080
```

Para la red local: `npx hardhat node`, desplegá tus contratos ahí y pegá las direcciones en la interfaz. Importá en MetaMask una de las cuentas de prueba que imprime el nodo.
