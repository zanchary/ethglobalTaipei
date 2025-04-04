// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CrossChainBridge
 * @dev Contract to handle cross-chain payments for the EventTicketing platform
 */
contract CrossChainBridge is Ownable, ReentrancyGuard {
    // Structure to store payment verification info
    struct PaymentInfo {
        uint256 sourceChainId;     // Source chain where payment was made
        bytes32 paymentTxHash;     // Transaction hash on source chain
        address payer;             // Address that made the payment
        uint256 amount;            // Amount paid
        uint256 eventId;           // Event ID for which payment was made
        bool isProcessed;          // Whether this payment has been processed
        uint256 timestamp;         // When the payment was recorded
    }
    
    // Maps payment ID to payment info
    mapping(bytes32 => PaymentInfo) public payments;
    
    // Maps source chain ID to trusted relayer address
    mapping(uint256 => address) public trustedRelayers;
    
    // Maps source chain ID to price feed contract (for price conversion)
    mapping(uint256 => address) public priceFeedContracts;
    
    // Token addresses accepted on different chains
    mapping(uint256 => mapping(address => bool)) public acceptedTokens;
    
    // Exchange rates between different chains (in basis points, 10000 = 1x)
    mapping(uint256 => uint256) public exchangeRates;
    
    // Event emitted when a cross-chain payment is recorded
    event CrossChainPaymentRecorded(
        bytes32 indexed paymentId,
        uint256 indexed sourceChainId,
        address indexed payer,
        uint256 amount,
        uint256 eventId
    );
    
    // Event emitted when a payment is processed
    event PaymentProcessed(
        bytes32 indexed paymentId,
        uint256 indexed eventId
    );
    
    /**
     * @dev Constructor
     */
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Adds a trusted relayer for a specific chain
     * @param chainId ID of the source chain
     * @param relayer Address of the trusted relayer
     */
    function addTrustedRelayer(uint256 chainId, address relayer) external onlyOwner {
        require(relayer != address(0), "Invalid relayer address");
        trustedRelayers[chainId] = relayer;
    }
    
    /**
     * @dev Sets the exchange rate for a specific chain
     * @param chainId ID of the source chain
     * @param rate Exchange rate in basis points (10000 = 1x)
     */
    function setExchangeRate(uint256 chainId, uint256 rate) external onlyOwner {
        require(rate > 0, "Exchange rate must be positive");
        exchangeRates[chainId] = rate;
    }
    
    /**
     * @dev Adds an accepted token for a specific chain
     * @param chainId ID of the source chain
     * @param token Address of the accepted token (address(0) for native token)
     */
    function addAcceptedToken(uint256 chainId, address token) external onlyOwner {
        // Allow address(0) to represent the native token
        acceptedTokens[chainId][token] = true;
    }
    
    /**
     * @dev Sets a price feed contract for a specific chain
     * @param chainId ID of the source chain
     * @param priceFeed Address of the price feed contract
     */
    function setPriceFeed(uint256 chainId, address priceFeed) external onlyOwner {
        require(priceFeed != address(0), "Invalid price feed address");
        priceFeedContracts[chainId] = priceFeed;
    }
    
    /**
     * @dev Records a payment from another chain (called by trusted relayer)
     * @param sourceChainId ID of the source chain
     * @param paymentTxHash Transaction hash on source chain
     * @param payer Address that made the payment
     * @param token Address of the token used for payment
     * @param amount Amount paid in source chain's native token
     * @param eventId Event ID for which payment was made
     * @return paymentId Unique ID for this payment
     */
    function recordCrossChainPayment(
        uint256 sourceChainId,
        bytes32 paymentTxHash,
        address payer,
        address token,
        uint256 amount,
        uint256 eventId
    ) external nonReentrant returns (bytes32) {
        // Verify sender is a trusted relayer for this chain
        require(msg.sender == trustedRelayers[sourceChainId], "Not a trusted relayer");
        
        // Verify token is accepted
        require(acceptedTokens[sourceChainId][token], "Token not accepted");
        
        // Verify exchange rate is set
        require(exchangeRates[sourceChainId] > 0, "Exchange rate not set");
        
        // Create unique payment ID
        bytes32 paymentId = keccak256(abi.encodePacked(
            sourceChainId,
            paymentTxHash,
            payer,
            amount,
            eventId,
            block.timestamp
        ));
        
        // Ensure payment hasn't been processed before
        require(payments[paymentId].timestamp == 0, "Payment already processed");
        
        // Store payment info
        payments[paymentId] = PaymentInfo({
            sourceChainId: sourceChainId,
            paymentTxHash: paymentTxHash,
            payer: payer,
            amount: amount,
            eventId: eventId,
            isProcessed: false,
            timestamp: block.timestamp
        });
        
        emit CrossChainPaymentRecorded(
            paymentId,
            sourceChainId,
            payer,
            amount,
            eventId
        );
        
        return paymentId;
    }
    
    /**
     * @dev Converts an amount from source chain to target chain using the exchange rate
     * @param sourceChainId ID of the source chain
     * @param amount Amount in source chain's native token
     * @return Equivalent amount in target chain's native token
     */
    function convertAmount(uint256 sourceChainId, uint256 amount) public view returns (uint256) {
        // Get exchange rate (in basis points)
        uint256 rate = exchangeRates[sourceChainId];
        require(rate > 0, "Exchange rate not set");
        
        // Apply exchange rate
        return (amount * rate) / 10000;
    }
    
    /**
     * @dev Gets payment information
     * @param paymentId ID of the payment
     * @return Payment information
     */
    function getPaymentInfo(bytes32 paymentId) external view returns (PaymentInfo memory) {
        return payments[paymentId];
    }
    
    /**
     * @dev Marks a payment as processed
     * @param paymentId ID of the payment
     */
    function markPaymentAsProcessed(bytes32 paymentId) external {
        // In a real implementation, this would be called by the EventTicketing contract
        require(payments[paymentId].timestamp > 0, "Payment does not exist");
        require(!payments[paymentId].isProcessed, "Payment already processed");
        
        payments[paymentId].isProcessed = true;
        
        emit PaymentProcessed(paymentId, payments[paymentId].eventId);
    }
    
    /**
     * @dev Allows contract to receive native currency
     */
    receive() external payable {}
} 