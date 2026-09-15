// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {VeydravaVault} from "../src/VeydravaVault.sol";
import {TestUSD} from "../src/TestUSD.sol";

interface DeployVm {
    function envOr(string calldata, address) external returns (address);
    function envOr(string calldata, uint256) external returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract Deploy {
    DeployVm constant vm = DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    event Deployment(address owner, address token, address vault);

    function run() external returns (VeydravaVault vault, address token) {
        require(block.chainid == 11155111 || block.chainid == 31337, "TESTNET_RELEASE");
        address owner = vm.envOr("OWNER_ADDRESS", address(bytes20(hex"cd25106586c679fa4e1d753914bb9b24240ae588")));
        token = vm.envOr("TOKEN_ADDRESS", address(0));
        vm.startBroadcast();
        if (token == address(0)) token = address(new TestUSD());
        // Raw token units. Default is 1,000 tokens only for a 6-decimal token.
        vault = new VeydravaVault(owner, token, vm.envOr("GLOBAL_DAILY_LIMIT", uint256(1000e6)));
        vm.stopBroadcast();
        emit Deployment(owner, token, address(vault));
    }
}
