# NFT Marketplace

Marketplace mínimo para comprar y vender **cualquier NFT (ERC-721) con cualquier token (ERC-20)**.
El vendedor elige en qué token cobra. HTML + JS plano con ethers.js v6 y MetaMask, sin build.

## Cómo funciona
- **Vender:** el dueño de un NFT lo publica con un precio en el token que quiera. El NFT **queda en su wallet**: solo autoriza al marketplace (`approve`) a transferirlo cuando alguien lo compre.
- **Comprar:** el comprador autoriza el pago en el token de la publicación y llama a `buy`. En una sola transacción los tokens van al vendedor y el NFT al comprador.
- **Retirar:** el vendedor puede cancelar su publicación en cualquier momento.
- Si el vendedor movió el NFT o quitó la autorización, la publicación aparece como "No disponible".

## Contrato
`contracts/Marketplace.sol`

| Función | Qué hace |
| --- | --- |
| `list(nft, tokenId, token, price)` | Publica un NFT propio. Para que se pueda vender, el NFT tiene que tener `approve` al marketplace (la app lo hace antes de publicar). |
| `buy(id)` | Compra una publicación. Requiere `approve(marketplace, price)` en el token de pago. |
| `cancel(id)` | Retira una publicación propia. |
| `getListings()` | Devuelve todas las publicaciones (las vendidas o canceladas tienen `seller = 0x0`). |

El precio se guarda en unidades mínimas del token (`uint96`, alcanza para ~79 mil millones de tokens de 18 decimales).

## Desplegar en Sepolia (Remix)
1. Pegá `contracts/Marketplace.sol` en [remix.ethereum.org](https://remix.ethereum.org).
2. **Solidity Compiler → Advanced Configurations → Enable optimization (200)** y compilá con 0.8.24 o superior.
3. **Deploy & Run:** entorno *Injected Provider - MetaMask* en Sepolia, gas limit `8000000`. El constructor no tiene parámetros.
4. Copiá la dirección desplegada y pegala en `config.js` (`NETWORKS[11155111].marketplace`) para que quede precargada, o ingresala desde la interfaz.

**Desplegado en Sepolia:** `0x3D1D8B52D5957848AC1a9064a0a8F018223d9C86` (ya precargado en `config.js`).

> Desde Glamsterdam (Sepolia, 6/10/2026) guardar código y datos nuevos cuesta mucho más gas. El deploy optimizado usa ~3,8M; publicar un NFT, unos cientos de miles.

El contrato es deliberadamente mínimo: sin eventos ni librerías extra. La publicación se marca como vendida antes de mover tokens, lo que evita reentradas.

## Correr
```bash
cd apps/nft-marketplace
npx serve .
```
