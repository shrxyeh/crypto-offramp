// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/KrizPayCore.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC20 mock for testing
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract KrizPayP2PTest is Test {
    KrizPayP2P public p2p;
    MockERC20 public usdc;

    address public owner   = makeAddr("owner");
    address public user    = makeAddr("user");
    address public settler = makeAddr("settler");

    uint256 constant USDC_6 = 1e6; // 1 USDC

    function setUp() public {
        // Start at a timestamp safely above ORDER_COOLDOWN (10s)
        vm.warp(1000);

        vm.startPrank(owner);

        p2p  = new KrizPayP2P(owner);
        usdc = new MockERC20("USD Coin", "USDC");

        p2p.setSupportedToken(address(usdc), true);
        p2p.addSettler(settler);

        vm.stopPrank();

        // Fund user
        usdc.mint(user, 10_000 * USDC_6);
    }

    // ─── Create Order ──────────────────────────────────────────────────────────

    function test_CreateOrder() public {
        uint256 amount = 100 * USDC_6;

        vm.startPrank(user);
        usdc.approve(address(p2p), amount);
        uint256 orderId = p2p.createOrder(address(usdc), amount, 8300e18, "merchant@upi");
        vm.stopPrank();

        KrizPayP2P.Order memory order = p2p.getOrder(orderId);

        assertEq(order.user, user);
        assertEq(order.cryptoAmount, amount);
        assertEq(uint8(order.status), uint8(KrizPayP2P.OrderStatus.Open));
        assertEq(usdc.balanceOf(address(p2p)), amount);
    }

    function test_Revert_CreateOrder_UnsupportedToken() public {
        MockERC20 unknown = new MockERC20("Unknown", "UNK");
        unknown.mint(user, 1000 * USDC_6);

        vm.startPrank(user);
        unknown.approve(address(p2p), 100 * USDC_6);
        vm.expectRevert("Token not supported");
        p2p.createOrder(address(unknown), 100 * USDC_6, 8300e18, "merchant@upi");
        vm.stopPrank();
    }

    function test_Revert_CreateOrder_ZeroInrAmount() public {
        uint256 amount = 100 * USDC_6;

        vm.startPrank(user);
        usdc.approve(address(p2p), amount);
        vm.expectRevert("Invalid input");
        p2p.createOrder(address(usdc), amount, 0, "merchant@upi");
        vm.stopPrank();
    }

    // ─── Claim Order ───────────────────────────────────────────────────────────

    function test_ClaimOrder() public {
        uint256 orderId = _createOrder(100 * USDC_6);

        vm.prank(settler);
        p2p.claimOrder(orderId);

        KrizPayP2P.Order memory order = p2p.getOrder(orderId);
        assertEq(uint8(order.status), uint8(KrizPayP2P.OrderStatus.Claimed));
        assertEq(order.settler, settler);
    }

    function test_Revert_ClaimOrder_NotSettler() public {
        uint256 orderId = _createOrder(100 * USDC_6);

        vm.prank(user);
        vm.expectRevert("Not settler");
        p2p.claimOrder(orderId);
    }

    // ─── Complete Order ────────────────────────────────────────────────────────

    function test_CompleteOrder() public {
        uint256 amount = 100 * USDC_6;
        uint256 orderId = _createOrder(amount);

        vm.prank(settler);
        p2p.claimOrder(orderId);

        uint256 settlerBalanceBefore = usdc.balanceOf(settler);

        vm.prank(settler);
        p2p.completeOrder(orderId, "UTR1234567890");

        KrizPayP2P.Order memory order = p2p.getOrder(orderId);
        assertEq(uint8(order.status), uint8(KrizPayP2P.OrderStatus.Completed));

        // Settler receives amount minus 0.5% platform fee
        uint256 fee = (amount * 50) / 10000;
        assertEq(usdc.balanceOf(settler), settlerBalanceBefore + amount - fee);
    }

    function test_Revert_CompleteOrder_ShortUTR() public {
        uint256 orderId = _createOrder(100 * USDC_6);

        vm.prank(settler);
        p2p.claimOrder(orderId);

        vm.prank(settler);
        vm.expectRevert("Invalid UTR");
        p2p.completeOrder(orderId, "SHORT");
    }

    // ─── Cancel Expired Order ──────────────────────────────────────────────────

    function test_CancelExpiredOrder() public {
        uint256 amount = 100 * USDC_6;
        uint256 orderId = _createOrder(amount);
        uint256 userBalanceBefore = usdc.balanceOf(user);

        // Warp past the 30-minute order timeout
        vm.warp(block.timestamp + 31 minutes);

        vm.prank(user);
        p2p.cancelOrder(orderId);

        KrizPayP2P.Order memory order = p2p.getOrder(orderId);
        assertEq(uint8(order.status), uint8(KrizPayP2P.OrderStatus.Cancelled));
        assertEq(usdc.balanceOf(user), userBalanceBefore + amount);
    }

    function test_Revert_CancelOrder_NotExpired() public {
        uint256 orderId = _createOrder(100 * USDC_6);

        vm.prank(user);
        vm.expectRevert("Not expired");
        p2p.cancelOrder(orderId);
    }

    // ─── Dispute & Resolve ─────────────────────────────────────────────────────

    function test_DisputeAndResolve_Refund() public {
        uint256 amount = 100 * USDC_6;
        uint256 orderId = _createOrder(amount);
        uint256 userBalanceBefore = usdc.balanceOf(user);

        vm.prank(settler);
        p2p.claimOrder(orderId);

        // Warp past settlement timeout
        vm.warp(block.timestamp + 16 minutes);

        vm.prank(user);
        p2p.disputeOrder(orderId, "Settler didn't pay");

        vm.prank(owner);
        p2p.resolveDispute(orderId, true);

        KrizPayP2P.Order memory order = p2p.getOrder(orderId);
        assertEq(uint8(order.status), uint8(KrizPayP2P.OrderStatus.Cancelled));
        assertEq(usdc.balanceOf(user), userBalanceBefore + amount);
    }

    function test_DisputeAndResolve_FavorSettler() public {
        uint256 amount = 100 * USDC_6;
        uint256 orderId = _createOrder(amount);
        uint256 settlerBalanceBefore = usdc.balanceOf(settler);

        vm.prank(settler);
        p2p.claimOrder(orderId);

        vm.warp(block.timestamp + 16 minutes);

        vm.prank(user);
        p2p.disputeOrder(orderId, "Settler didn't pay");

        vm.prank(owner);
        p2p.resolveDispute(orderId, false);

        uint256 fee = (amount * 50) / 10000;
        assertEq(usdc.balanceOf(settler), settlerBalanceBefore + amount - fee);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function test_WithdrawFees() public {
        uint256 amount = 100 * USDC_6;
        uint256 orderId = _createOrder(amount);

        vm.prank(settler);
        p2p.claimOrder(orderId);
        vm.prank(settler);
        p2p.completeOrder(orderId, "UTR1234567890");

        uint256 expectedFee = (amount * 50) / 10000;
        uint256 ownerBalanceBefore = usdc.balanceOf(owner);

        vm.prank(owner);
        p2p.withdrawFees(address(usdc), owner);

        assertEq(usdc.balanceOf(owner), ownerBalanceBefore + expectedFee);
    }

    function test_PauseUnpause() public {
        vm.prank(owner);
        p2p.pause();

        uint256 amount = 100 * USDC_6;
        vm.startPrank(user);
        usdc.approve(address(p2p), amount);
        vm.expectRevert();
        p2p.createOrder(address(usdc), amount, 8300e18, "merchant@upi");
        vm.stopPrank();

        vm.prank(owner);
        p2p.unpause();

        // Advance past cooldown then create a new order
        vm.warp(block.timestamp + 11);
        vm.startPrank(user);
        usdc.approve(address(p2p), amount);
        p2p.createOrder(address(usdc), amount, 8300e18, "merchant@upi");
        vm.stopPrank();
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    function _createOrder(uint256 amount) internal returns (uint256 orderId) {
        vm.warp(block.timestamp + 11); // advance past ORDER_COOLDOWN (10s)
        vm.startPrank(user);
        usdc.approve(address(p2p), amount);
        orderId = p2p.createOrder(address(usdc), amount, 8300e18, "merchant@upi");
        vm.stopPrank();
    }
}
