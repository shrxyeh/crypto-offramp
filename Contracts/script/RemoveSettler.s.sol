// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/KrizPayCore.sol";

contract RemoveSettler is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address contractAddress = vm.envAddress("CONTRACT_ADDRESS");
        address settlerAddress = vm.envAddress("SETTLER_ADDRESS");

        KrizPayP2P p2p = KrizPayP2P(contractAddress);

        console.log("Removing settler:", settlerAddress);

        vm.startBroadcast(deployerPrivateKey);
        p2p.removeSettler(settlerAddress);
        vm.stopBroadcast();

        bool isVerified = p2p.verifiedSettlers(settlerAddress);
        console.log("Verified after removal:", isVerified);
    }
}
