// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ConfidentialToken} from "./ConfidentialToken.sol";

contract TokenFactory is ZamaEthereumConfig {
    uint64 public constant DEFAULT_SUPPLY = 1_000_000_000;

    struct TokenView {
        address token;
        string name;
        string symbol;
        uint64 maxSupply;
        uint256 pricePerToken;
        address creator;
    }

    TokenView[] private _tokens;

    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint64 maxSupply,
        uint256 pricePerToken
    );

    function createToken(
        string memory name_,
        string memory symbol_,
        uint64 totalSupply_,
        uint256 pricePerToken_
    ) external returns (address tokenAddress) {
        uint64 finalSupply = totalSupply_ == 0 ? DEFAULT_SUPPLY : totalSupply_;
        ConfidentialToken newToken = new ConfidentialToken(name_, symbol_, finalSupply, pricePerToken_, msg.sender);
        tokenAddress = address(newToken);

        _tokens.push(
            TokenView({
                token: tokenAddress,
                name: name_,
                symbol: symbol_,
                maxSupply: finalSupply,
                pricePerToken: pricePerToken_,
                creator: msg.sender
            })
        );

        emit TokenCreated(tokenAddress, msg.sender, name_, symbol_, finalSupply, pricePerToken_);
    }

    function tokenCount() external view returns (uint256) {
        return _tokens.length;
    }

    function getToken(uint256 index) external view returns (TokenView memory tokenView) {
        require(index < _tokens.length, "Invalid index");
        tokenView = _tokens[index];
    }

    function getCatalog() external view returns (TokenView[] memory tokens, uint64[] memory saleSupply) {
        uint256 length = _tokens.length;
        tokens = new TokenView[](length);
        saleSupply = new uint64[](length);

        for (uint256 i = 0; i < length; i++) {
            TokenView memory entry = _tokens[i];
            tokens[i] = entry;
            saleSupply[i] = ConfidentialToken(entry.token).saleSupply();
        }
    }
}
