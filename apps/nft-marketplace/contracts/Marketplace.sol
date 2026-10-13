// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Marketplace mínimo: cualquier NFT (ERC-721) se vende por cualquier token (ERC-20).
/// El NFT queda en la wallet del vendedor hasta que alguien lo compra.
contract Marketplace {
    struct Listing {
        address seller;  // address(0) = vendida o cancelada
        uint96 price;    // en unidades mínimas del token
        address nft;
        address token;
        uint256 tokenId;
    }

    Listing[] private listings;

    /// Publicar. Antes: approve(marketplace, tokenId) en el contrato del NFT.
    function list(address nft, uint256 tokenId, address token, uint96 price) external {
        require(IERC721(nft).ownerOf(tokenId) == msg.sender, "No sos el duenio del NFT");
        require(price > 0, "Precio invalido");
        listings.push(Listing(msg.sender, price, nft, token, tokenId));
    }

    /// Comprar. Antes: approve(marketplace, price) en el token de pago.
    function buy(uint256 id) external {
        Listing memory l = listings[id];
        require(l.seller != address(0), "Publicacion no disponible");
        require(l.seller != msg.sender, "No podes comprar tu propio NFT");

        delete listings[id]; // primero se marca como vendida
        require(IERC20(l.token).transferFrom(msg.sender, l.seller, l.price), "Fallo el pago");
        IERC721(l.nft).transferFrom(l.seller, msg.sender, l.tokenId);
    }

    /// Retirar una publicación propia.
    function cancel(uint256 id) external {
        require(listings[id].seller == msg.sender, "No es tu publicacion");
        delete listings[id];
    }

    /// Todas las publicaciones (la app filtra las que tienen seller = 0).
    function getListings() external view returns (Listing[] memory) {
        return listings;
    }
}
