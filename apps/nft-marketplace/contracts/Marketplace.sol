// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Marketplace
/// @notice Compra y venta de cualquier NFT (ERC-721) con cualquier token (ERC-20).
///         El vendedor elige en qué token cobra. El NFT queda en su wallet hasta que se vende:
///         el marketplace solo necesita su autorización (approve) para transferirlo.
contract Marketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Listing {
        address seller;  // dueño del NFT. address(0) = publicación vendida o cancelada
        uint96 price;    // precio en unidades mínimas del token de pago
        address nft;     // contrato ERC-721
        address token;   // contrato ERC-20 con el que se cobra
        uint256 tokenId; // id del NFT
    }

    Listing[] private _listings;

    event Listed(uint256 indexed id, address indexed seller, address indexed nft, uint256 tokenId, address token, uint256 price);
    event Sold(uint256 indexed id, address indexed buyer);
    event Cancelled(uint256 indexed id);

    /// @notice Publica un NFT propio. Antes hay que autorizar al marketplace en el contrato del NFT
    ///         (approve(marketplace, tokenId) o setApprovalForAll(marketplace, true)).
    function list(address nft, uint256 tokenId, address token, uint96 price) external returns (uint256 id) {
        require(price > 0, "Precio invalido");
        require(IERC721(nft).ownerOf(tokenId) == msg.sender, "No sos el duenio del NFT");
        require(_isApproved(nft, tokenId, msg.sender), "Falta autorizar al marketplace");

        id = _listings.length;
        _listings.push(Listing(msg.sender, price, nft, token, tokenId));
        emit Listed(id, msg.sender, nft, tokenId, token, price);
    }

    /// @notice Compra una publicación. Antes hay que hacer approve(marketplace, price) en el token de pago.
    function buy(uint256 id) external nonReentrant {
        Listing memory l = _listings[id];
        require(l.seller != address(0), "Publicacion no disponible");
        require(l.seller != msg.sender, "No podes comprar tu propio NFT");

        delete _listings[id]; // se marca como vendida antes de mover nada
        IERC20(l.token).safeTransferFrom(msg.sender, l.seller, l.price);
        IERC721(l.nft).transferFrom(l.seller, msg.sender, l.tokenId);
        emit Sold(id, msg.sender);
    }

    /// @notice Retira una publicación propia.
    function cancel(uint256 id) external {
        require(_listings[id].seller == msg.sender, "No es tu publicacion");
        delete _listings[id];
        emit Cancelled(id);
    }

    /// @notice Todas las publicaciones. Las vendidas o canceladas tienen seller = address(0).
    function getListings() external view returns (Listing[] memory) {
        return _listings;
    }

    function _isApproved(address nft, uint256 tokenId, address owner) private view returns (bool) {
        return IERC721(nft).getApproved(tokenId) == address(this)
            || IERC721(nft).isApprovedForAll(owner, address(this));
    }
}
