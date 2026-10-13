// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Entradas
/// @notice NFT de entrada para un evento. Cada entrada se compra pagando un precio fijo
///         en un ERC-20 (por ejemplo MC). El pago va directo al organizador.
contract Entradas is ERC721 {
    using SafeERC20 for IERC20Metadata;

    IERC20Metadata public immutable paymentToken; // token con el que se paga
    uint256 public immutable price;               // precio en unidades mínimas del token
    uint256 public immutable maxSupply;           // cantidad total de entradas
    address public immutable organizer;           // quien recibe los pagos (quien despliega)
    uint256 public totalSold;                     // entradas vendidas (también es el último id)

    /// @param eventName      Nombre del evento, se usa como nombre de la colección
    /// @param _paymentToken  Dirección del ERC-20 con el que se paga
    /// @param priceInTokens  Precio en tokens enteros (ej: 10 = 10 MC)
    /// @param _maxSupply     Cantidad de entradas disponibles
    constructor(
        string memory eventName,
        IERC20Metadata _paymentToken,
        uint256 priceInTokens,
        uint256 _maxSupply
    ) ERC721(eventName, "ENTRADA") {
        paymentToken = _paymentToken;
        price = priceInTokens * 10 ** _paymentToken.decimals();
        maxSupply = _maxSupply;
        organizer = msg.sender;
    }

    /// @notice Compra una entrada. Antes hay que hacer approve(esteContrato, price) en el ERC-20.
    function buy() external {
        require(totalSold < maxSupply, "Entradas agotadas");
        paymentToken.safeTransferFrom(msg.sender, organizer, price);
        totalSold++;
        _mint(msg.sender, totalSold); // ids desde 1
    }

    /// @notice Entradas que quedan a la venta.
    function remaining() external view returns (uint256) {
        return maxSupply - totalSold;
    }
}
