// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test currency with no monetary value; cannot be deployed on a public mainnet.
contract TestUSD is ERC20 {
    constructor() ERC20("Veydrava Test USD", "tUSD") {
        require(block.chainid == 11155111 || block.chainid == 31337, "TESTNET_ONLY");
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        _mint(msg.sender, 10_000 * 10 ** 6);
    }
}
