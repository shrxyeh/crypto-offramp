// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title KrizPayP2P - Production Ready
 * @notice P2P escrow for crypto-to-INR payments via UPI
 * @dev Fee-on-transfer tokens NOT supported
 */
contract KrizPayP2P is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum OrderStatus { Open, Claimed, Completed, Disputed, Cancelled }
    
    struct Order {
        address user;
        address token;
        uint256 cryptoAmount;
        uint256 inrAmount;
        string merchantUpiId;
        uint256 expiryTime;
        address settler;
        OrderStatus status;
        string utrNumber;
    }

    mapping(address => bool) public supportedTokens;
    mapping(address => bool) public verifiedSettlers;
    mapping(address => uint256) public settlerReputation;
    mapping(address => uint256[]) public userOrders;
    mapping(address => uint256[]) public settlerOrders;
    Order[] public orders;

    mapping(address => uint256) public lastOrderTime;
    mapping(address => uint256) public dailyOrderCount;
    mapping(address => uint256) public lastResetDay;

    mapping(address => uint256) public collectedFees;
    mapping(address => uint256) public lockedAmounts;

    uint256 public constant ORDER_TIMEOUT = 30 minutes;
    uint256 public constant SETTLEMENT_TIMEOUT = 15 minutes;
    uint256 public constant ORDER_COOLDOWN = 10 seconds;
    uint256 public constant MAX_DAILY_ORDERS = 100;

    uint256 public minOrderAmount = 1 * 10**6;
    uint256 public maxOrderAmount = 100000 * 10**6;
    uint256 public platformFeeBps = 50; // 0.5%

    event OrderCreated(uint256 indexed id, address indexed user, address token, uint256 amount, uint256 expiry);
    event OrderClaimed(uint256 indexed id, address indexed settler);
    event OrderCompleted(uint256 indexed id, address indexed settler, address indexed token, string utr);
    event OrderCancelled(uint256 indexed id, address indexed user, address indexed token, uint256 amount);
    event OrderDisputed(uint256 indexed id, address indexed user, address indexed token, string reason);
    event DisputeResolved(uint256 indexed id, bool refunded, address recipient, uint256 amount);
    event FeesWithdrawn(address indexed token, address indexed to, uint256 amount);
    event ERC20Recovered(address indexed token, address indexed to, uint256 amount);
    event SettlerVerified(address indexed settler, bool verified);
    event TokenSupportUpdated(address indexed token, bool supported);
    event PlatformFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event OrderLimitsUpdated(uint256 minAmount, uint256 maxAmount);

    /**
     * @dev Constructor with standard Ownable pattern
     * @param initialOwner Address that will own the contract
     */
    constructor(address initialOwner) Ownable(initialOwner) {
        require(initialOwner != address(0), "Zero address");
        verifiedSettlers[initialOwner] = true;
        emit SettlerVerified(initialOwner, true);
    }

    modifier onlySettler() {
        require(verifiedSettlers[msg.sender], "Not settler");
        _;
    }
    
    modifier validOrder(uint256 id) {
        require(id < orders.length, "Invalid order");
        _;
    }


    function setSupportedToken(address token, bool supported) external onlyOwner {
        require(token != address(0), "Zero address");
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    function addSettler(address settler) external onlyOwner {
        require(settler != address(0), "Zero address");
        verifiedSettlers[settler] = true;
        emit SettlerVerified(settler, true);
    }

    function removeSettler(address settler) external onlyOwner {
        verifiedSettlers[settler] = false;
        emit SettlerVerified(settler, false);
    }

    function batchAddSettlers(address[] calldata settlers) external onlyOwner {
        for (uint256 i = 0; i < settlers.length; i++) {
            if (settlers[i] != address(0)) {
                verifiedSettlers[settlers[i]] = true;
                emit SettlerVerified(settlers[i], true);
            }
        }
    }

    function setOrderLimits(uint256 minAmt, uint256 maxAmt) external onlyOwner {
        require(minAmt > 0 && minAmt < maxAmt, "Invalid limits");
        minOrderAmount = minAmt;
        maxOrderAmount = maxAmt;
        emit OrderLimitsUpdated(minAmt, maxAmt);
    }

    function setPlatformFee(uint256 bps) external onlyOwner {
        require(bps <= 200, "Fee too high"); 
        uint256 oldFee = platformFeeBps;
        platformFeeBps = bps;
        emit PlatformFeeUpdated(oldFee, bps);
    }


    /**
     * @notice Create a new order
     * @dev Detects and rejects fee-on-transfer tokens
     */
    function createOrder(
        address token,
        uint256 cryptoAmount,
        uint256 inrAmount,
        string calldata merchantUpiId
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(supportedTokens[token], "Token not supported");
        require(cryptoAmount >= minOrderAmount && cryptoAmount <= maxOrderAmount, "Invalid amount");
        require(inrAmount > 0 && bytes(merchantUpiId).length > 0, "Invalid input");

        require(block.timestamp >= lastOrderTime[msg.sender] + ORDER_COOLDOWN, "Cooldown");
        uint256 day = block.timestamp / 1 days;
        if (lastResetDay[msg.sender] < day) {
            dailyOrderCount[msg.sender] = 0;
            lastResetDay[msg.sender] = day;
        }
        require(dailyOrderCount[msg.sender] < MAX_DAILY_ORDERS, "Daily limit");
        lastOrderTime[msg.sender] = block.timestamp;
        dailyOrderCount[msg.sender]++;

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), cryptoAmount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        require(balanceAfter - balanceBefore == cryptoAmount, "Fee-on-transfer not allowed");

        orders.push(Order({
            user: msg.sender,
            token: token,
            cryptoAmount: cryptoAmount,
            inrAmount: inrAmount,
            merchantUpiId: merchantUpiId,
            expiryTime: block.timestamp + ORDER_TIMEOUT,
            settler: address(0),
            status: OrderStatus.Open,
            utrNumber: ""
        }));

        uint256 orderId = orders.length - 1;
        userOrders[msg.sender].push(orderId);
        lockedAmounts[token] += cryptoAmount;

        emit OrderCreated(orderId, msg.sender, token, cryptoAmount, orders[orderId].expiryTime);
        return orderId;
    }

    function claimOrder(uint256 orderId) external nonReentrant whenNotPaused onlySettler validOrder(orderId) {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Open, "Not open");
        require(block.timestamp < order.expiryTime, "Expired");

        order.settler = msg.sender;
        order.status = OrderStatus.Claimed;
        order.expiryTime = block.timestamp + SETTLEMENT_TIMEOUT;
        settlerOrders[msg.sender].push(orderId);

        emit OrderClaimed(orderId, msg.sender);
    }

    function completeOrder(uint256 orderId, string calldata utr) external nonReentrant whenNotPaused validOrder(orderId) {
        Order storage order = orders[orderId];
        require(order.settler == msg.sender, "Not your order");
        require(order.status == OrderStatus.Claimed, "Not claimed");
        require(bytes(utr).length >= 10, "Invalid UTR");

        order.status = OrderStatus.Completed;
        order.utrNumber = utr;

        uint256 platformFee = (order.cryptoAmount * platformFeeBps) / 10000;
        uint256 settlerAmount = order.cryptoAmount - platformFee;

        lockedAmounts[order.token] -= order.cryptoAmount;
        collectedFees[order.token] += platformFee;
        settlerReputation[msg.sender]++;

        IERC20(order.token).safeTransfer(msg.sender, settlerAmount);
        emit OrderCompleted(orderId, msg.sender, order.token, utr);
    }

    function disputeOrder(uint256 orderId, string calldata reason) external whenNotPaused validOrder(orderId) {
        Order storage order = orders[orderId];
        require(order.user == msg.sender, "Not your order");
        require(order.status == OrderStatus.Claimed, "Cannot dispute");
        require(block.timestamp > order.expiryTime, "Wait for timeout");

        order.status = OrderStatus.Disputed;
        emit OrderDisputed(orderId, msg.sender, order.token, reason);
    }

    function cancelOrder(uint256 orderId) external nonReentrant validOrder(orderId) {
        Order storage order = orders[orderId];
        require(order.user == msg.sender, "Not your order");
        require(order.status == OrderStatus.Open, "Cannot cancel");
        require(block.timestamp > order.expiryTime, "Not expired");

        order.status = OrderStatus.Cancelled;
        lockedAmounts[order.token] -= order.cryptoAmount;

        IERC20(order.token).safeTransfer(order.user, order.cryptoAmount);
        emit OrderCancelled(orderId, order.user, order.token, order.cryptoAmount);
    }

    function resolveDispute(uint256 orderId, bool refundUser) external onlyOwner nonReentrant validOrder(orderId) {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Disputed, "Not disputed");
        require(order.settler != address(0), "No settler assigned");

        if (refundUser) {
            order.status = OrderStatus.Cancelled;
            lockedAmounts[order.token] -= order.cryptoAmount;
            IERC20(order.token).safeTransfer(order.user, order.cryptoAmount);
            emit DisputeResolved(orderId, true, order.user, order.cryptoAmount);
        } else {
            uint256 platformFee = (order.cryptoAmount * platformFeeBps) / 10000;
            uint256 settlerAmount = order.cryptoAmount - platformFee;

            order.status = OrderStatus.Completed;
            lockedAmounts[order.token] -= order.cryptoAmount;
            collectedFees[order.token] += platformFee;
            settlerReputation[order.settler]++;

            IERC20(order.token).safeTransfer(order.settler, settlerAmount);
            emit DisputeResolved(orderId, false, order.settler, settlerAmount);
        }
    }


    function getOrder(uint256 orderId) external view validOrder(orderId) returns (Order memory) {
        return orders[orderId];
    }

    function getOrderCount() external view returns (uint256) {
        return orders.length;
    }

    function getUserOrders(address user) external view returns (uint256[] memory) {
        return userOrders[user];
    }

    function getSettlerOrders(address settler) external view returns (uint256[] memory) {
        return settlerOrders[settler];
    }

    function getSettlerStats(address settler) external view returns (
        bool isVerified,
        uint256 reputation,
        uint256 totalOrders
    ) {
        return (
            verifiedSettlers[settler],
            settlerReputation[settler],
            settlerOrders[settler].length
        );
    }

    function getTotalValueLocked(address token) external view returns (uint256) {
        return lockedAmounts[token];
    }

    function getContractBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
}

    /**
     * @notice Get open orders (use off-chain indexing for large datasets)
     */
    function getOpenOrders() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < orders.length; i++) {
            if (orders[i].status == OrderStatus.Open && block.timestamp < orders[i].expiryTime) {
                count++;
            }
        }

        uint256[] memory openOrderIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < orders.length; i++) {
            if (orders[i].status == OrderStatus.Open && block.timestamp < orders[i].expiryTime) {
                openOrderIds[index] = i;
                index++;
            }
        }

        return openOrderIds;
    }


    function withdrawFees(address token, address to) external onlyOwner nonReentrant {
        require(to != address(0), "Zero address");
        uint256 amount = collectedFees[token];
        require(amount > 0, "No fees");

        collectedFees[token] = 0;
        IERC20(token).safeTransfer(to, amount);
        emit FeesWithdrawn(token, to, amount);
    }

    /**
     * @notice Emergency recovery of accidentally sent tokens
     * @dev Cannot recover locked funds or collected fees
     */
    function recoverERC20(address token, address to) external onlyOwner nonReentrant {
        require(to != address(0), "Zero address");

        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 locked = lockedAmounts[token] + collectedFees[token];
        require(balance > locked, "Nothing to recover");

        uint256 recoverable = balance - locked;
        IERC20(token).safeTransfer(to, recoverable);
        emit ERC20Recovered(token, to, recoverable);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}