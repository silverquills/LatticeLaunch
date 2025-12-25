// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "confidential-contracts-v91/contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

contract ConfidentialToken is ERC7984, ZamaEthereumConfig {
    address public immutable creator;
    uint64 public immutable maxSupply;
    uint64 public saleSupply;
    uint256 public immutable pricePerToken;
    uint256 public immutable createdAt;

    event TokenPurchased(address indexed buyer, uint64 amount, uint256 paidWei, euint64 encryptedAmount);
    event ProceedsWithdrawn(address indexed receiver, uint256 amount);
    event SaleSupplyClaimed(address indexed receiver, uint64 amount, euint64 encryptedAmount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint64 totalSupply_,
        uint256 pricePerToken_,
        address creator_
    ) ERC7984(name_, symbol_, "") {
        require(bytes(name_).length > 0, "Name required");
        require(bytes(symbol_).length > 0, "Symbol required");
        require(totalSupply_ > 0, "Supply required");
        require(pricePerToken_ > 0, "Price required");
        creator = creator_;
        maxSupply = totalSupply_;
        saleSupply = totalSupply_;
        pricePerToken = pricePerToken_;
        createdAt = block.timestamp;

        euint64 encryptedSupply = FHE.asEuint64(totalSupply_);
        FHE.allowThis(encryptedSupply);
        _mint(address(this), encryptedSupply);
    }

    function buy(uint64 amount) external payable returns (euint64 transferred) {
        require(amount > 0, "Amount required");
        require(amount <= saleSupply, "Insufficient supply");

        uint256 requiredPayment = uint256(amount) * pricePerToken;
        require(msg.value >= requiredPayment, "Not enough ETH");

        saleSupply -= amount;

        euint64 encryptedAmount = FHE.asEuint64(amount);
        FHE.allowThis(encryptedAmount);

        transferred = _transfer(address(this), msg.sender, encryptedAmount);
        FHE.allow(transferred, msg.sender);

        if (msg.value > requiredPayment) {
            (bool refundSuccess, ) = msg.sender.call{value: msg.value - requiredPayment}("");
            require(refundSuccess, "Refund failed");
        }

        emit TokenPurchased(msg.sender, amount, requiredPayment, transferred);
    }

    function withdrawProceeds(address receiver) external {
        require(msg.sender == creator, "Only creator");
        require(receiver != address(0), "Invalid receiver");

        uint256 balance = address(this).balance;
        require(balance > 0, "No proceeds");

        (bool success, ) = receiver.call{value: balance}("");
        require(success, "Withdraw failed");

        emit ProceedsWithdrawn(receiver, balance);
    }

    function claimUnsold(address receiver, uint64 amount) external returns (euint64 transferred) {
        require(msg.sender == creator, "Only creator");
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Amount required");
        require(amount <= saleSupply, "Amount too high");

        saleSupply -= amount;

        euint64 encryptedAmount = FHE.asEuint64(amount);
        FHE.allowThis(encryptedAmount);

        transferred = _transfer(address(this), receiver, encryptedAmount);
        FHE.allow(transferred, receiver);

        emit SaleSupplyClaimed(receiver, amount, transferred);
    }
}
