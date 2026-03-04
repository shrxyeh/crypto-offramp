// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/KrizPayCore.sol";

contract Deploy is Script {
    // Token addresses per network
    struct TokenConfig {
        address usdc;
        address usdt;
    }

    function getTokens(uint256 chainId) internal pure returns (TokenConfig memory) {
        if (chainId == 8453) {
            // Base Mainnet
            return TokenConfig({
                usdc: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,
                usdt: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
            });
        } else if (chainId == 1) {
            // Ethereum Mainnet
            return TokenConfig({
                usdc: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,
                usdt: 0xdAC17F958D2ee523a2206206994597C13D831ec7
            });
        } else if (chainId == 137) {
            // Polygon
            return TokenConfig({
                usdc: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174,
                usdt: 0xc2132D05D31c914a87C6611C10748AEb04B58e8F
            });
        } else {
            // Sepolia testnet (default)
            return TokenConfig({
                usdc: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238,
                usdt: 0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0
            });
        }
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying KrizPayP2P...");
        console.log("Deployer:   ", deployer);
        console.log("Chain ID:   ", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        KrizPayP2P p2p = new KrizPayP2P(deployer);

        // Set supported tokens
        TokenConfig memory tokens = getTokens(block.chainid);
        p2p.setSupportedToken(tokens.usdc, true);
        p2p.setSupportedToken(tokens.usdt, true);
        console.log("Tokens configured: USDC + USDT");

        // Add initial settlers from env (comma-separated, optional)
        try vm.envString("INITIAL_SETTLERS") returns (string memory settlersRaw) {
            if (bytes(settlersRaw).length > 0) {
                address[] memory settlers = _parseAddresses(settlersRaw);
                for (uint256 i = 0; i < settlers.length; i++) {
                    if (settlers[i] != address(0)) {
                        p2p.addSettler(settlers[i]);
                        console.log("Settler added:", settlers[i]);
                    }
                }
            }
        } catch {}

        vm.stopBroadcast();

        console.log("----------------------------------------");
        console.log("KrizPayP2P deployed at:", address(p2p));
        console.log("----------------------------------------");
        console.log("To verify:");
        console.log(
            string.concat(
                "forge verify-contract ",
                vm.toString(address(p2p)),
                " src/KrizPayCore.sol:KrizPayP2P --chain ",
                vm.toString(block.chainid)
            )
        );
    }

    /// @dev Parses a comma-separated string of addresses.
    ///      Handles up to 20 settlers. For larger batches use batchAddSettlers().
    function _parseAddresses(string memory raw) internal pure returns (address[] memory) {
        // Count commas to size array
        bytes memory b = bytes(raw);
        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ",") count++;
        }

        address[] memory result = new address[](count);
        uint256 idx = 0;
        uint256 start = 0;

        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ",") {
                // Extract substring
                bytes memory part = new bytes(i - start);
                for (uint256 j = start; j < i; j++) {
                    part[j - start] = b[j];
                }
                string memory addrStr = string(part);
                // Parse hex address (expects "0x..." format)
                if (bytes(addrStr).length == 42) {
                    result[idx] = _parseAddr(addrStr);
                }
                idx++;
                start = i + 1;
            }
        }
        return result;
    }

    function _parseAddr(string memory s) internal pure returns (address) {
        bytes memory b = bytes(s);
        uint160 addr = 0;
        // skip "0x" prefix (chars 0 and 1)
        for (uint256 i = 2; i < b.length; i++) {
            addr *= 16;
            uint8 c = uint8(b[i]);
            if (c >= 48 && c <= 57)       addr += c - 48;       // 0-9
            else if (c >= 65 && c <= 70)  addr += c - 55;       // A-F
            else if (c >= 97 && c <= 102) addr += c - 87;       // a-f
        }
        return address(addr);
    }
}
