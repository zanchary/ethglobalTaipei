// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "./interfaces.sol";

/**
 * @title CrossChainPaymentBridge
 * @dev Contract for handling cross-chain payments using Chainlink CCIP
 */
contract CrossChainPaymentBridge is Ownable, ReentrancyGuard, ChainlinkClient {
    
    // State variables
    address public ticketingApp;
    address public paymentProcessor;
    
    // Mapping from chain ID to payment receiver on that chain
    mapping(uint64 => address) public chainReceivers;
    // Mapping from token symbol to token address on this chain
    mapping(string => address) public supportedTokens;
    // Mapping from token address to price feed address
    mapping(address => address) public tokenPriceFeeds;
    // Cross-chain payment nonces for each destination chain
    mapping(uint64 => uint256) public chainNonces;
    // Payment record by chain and nonce
    mapping(uint64 => mapping(uint256 => CrossChainPayment)) public crossChainPayments;
    
    struct CrossChainPayment {
        address sender;
        address token;
        uint256 amount;
        uint256 timestamp;
        bool processed;
    }
    
    // Events
    event TokenAdded(string symbol, address tokenAddress, address priceFeedAddress);
    event ChainReceiverSet(uint64 chainId, address receiver);
    event CrossChainPaymentInitiated(uint64 chainId, uint256 nonce, address sender, address token, uint256 amount);
    event CrossChainPaymentReceived(uint64 sourceChainId, uint256 nonce, address receiver, uint256 amount);
    event TicketingAppSet(address ticketingApp);
    event PaymentProcessorSet(address paymentProcessor);
    
    // Constructor
    constructor() Ownable(msg.sender) {
        // Initialize Chainlink client with default parameters
        setChainlinkToken(0x326C977E6efc84E512bB9C30f76E30c160eD06FB); // Goerli LINK token
    }
    
    /**
     * @dev Sets the ticketing app address
     * @param _ticketingApp Address of the ticketing app contract
     */
    function setTicketingApp(address _ticketingApp) external onlyOwner {
        ticketingApp = _ticketingApp;
        emit TicketingAppSet(_ticketingApp);
    }
    
    /**
     * @dev Sets the payment processor address
     * @param _paymentProcessor Address of the payment processor contract
     */
    function setPaymentProcessor(address _paymentProcessor) external onlyOwner {
        paymentProcessor = _paymentProcessor;
        emit PaymentProcessorSet(_paymentProcessor);
    }
    
    /**
     * @dev Sets the Chainlink token address
     * @param _link Address of the LINK token
     */
    function setChainlinkToken(address _link) public onlyOwner {
        setChainlinkToken(_link);
    }
    
    /**
     * @dev Adds a supported token and its price feed
     * @param symbol Token symbol
     * @param tokenAddress Token contract address
     * @param priceFeedAddress Chainlink price feed address for the token
     */
    function addSupportedToken(string calldata symbol, address tokenAddress, address priceFeedAddress) external onlyOwner {
        supportedTokens[symbol] = tokenAddress;
        tokenPriceFeeds[tokenAddress] = priceFeedAddress;
        emit TokenAdded(symbol, tokenAddress, priceFeedAddress);
    }
    
    /**
     * @dev Sets the payment receiver for a chain
     * @param chainId Chainlink chain ID
     * @param receiver Address of the payment receiver on that chain
     */
    function setChainReceiver(uint64 chainId, address receiver) external onlyOwner {
        chainReceivers[chainId] = receiver;
        emit ChainReceiverSet(chainId, receiver);
    }
    
    /**
     * @dev Initiates a cross-chain payment
     * @param chainId Destination chain ID
     * @param token Token address to use for payment
     * @param amount Amount of tokens to send
     */
    function initiatePayment(uint64 chainId, address token, uint256 amount) external nonReentrant {
        require(chainReceivers[chainId] != address(0), "Destination chain not supported");
        require(tokenPriceFeeds[token] != address(0), "Token not supported");
        
        // Transfer tokens from sender to this contract
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        
        // Get the next nonce for this chain
        uint256 nonce = chainNonces[chainId]++;
        
        // Record the payment
        crossChainPayments[chainId][nonce] = CrossChainPayment({
            sender: msg.sender,
            token: token,
            amount: amount,
            timestamp: block.timestamp,
            processed: false
        });
        
        // Emit event for off-chain monitoring
        emit CrossChainPaymentInitiated(chainId, nonce, msg.sender, token, amount);
        
        // NOTE: In a real implementation, this would trigger a Chainlink CCIP call to transfer the payment
        // to the destination chain. For simplicity, we're just recording the intent here.
    }
    
    /**
     * @dev Receives a cross-chain payment (would be called by Chainlink CCIP in production)
     * @param sourceChainId Source chain ID
     * @param nonce Payment nonce from source chain
     * @param receiver Receiver address
     * @param amount Amount in native currency
     */
    function receivePayment(uint64 sourceChainId, uint256 nonce, address receiver, uint256 amount) external nonReentrant {
        // In production, this would be restricted to CCIP callbacks
        // For demo, we'll allow the owner to simulate receiving payments
        require(msg.sender == owner(), "Only owner can simulate receiving payments");
        
        // Process the payment on this chain
        // In a real implementation, this would forward the funds to the payment processor
        
        // Mark as processed
        crossChainPayments[sourceChainId][nonce].processed = true;
        
        emit CrossChainPaymentReceived(sourceChainId, nonce, receiver, amount);
    }
    
    /**
     * @dev Gets the ETH value of a token amount
     * @param token Token address
     * @param amount Token amount
     */
    function getEthValue(address token, uint256 amount) public view returns (uint256) {
        address priceFeed = tokenPriceFeeds[token];
        require(priceFeed != address(0), "Price feed not found");
        
        AggregatorV3Interface feed = AggregatorV3Interface(priceFeed);
        (, int256 price, , , ) = feed.latestRoundData();
        uint8 decimals = feed.decimals();
        
        // Convert price to ETH value
        return (amount * uint256(price)) / (10 ** uint256(decimals));
    }
    
    /**
     * @dev Gets the status of a cross-chain payment
     * @param chainId Destination chain ID
     * @param nonce Payment nonce
     */
    function getPaymentStatus(uint64 chainId, uint256 nonce) external view returns (
        address sender,
        address token,
        uint256 amount,
        uint256 timestamp,
        bool processed
    ) {
        CrossChainPayment storage payment = crossChainPayments[chainId][nonce];
        return (
            payment.sender,
            payment.token,
            payment.amount,
            payment.timestamp,
            payment.processed
        );
    }
    
    /**
     * @dev Cancels a pending cross-chain payment (only owner)
     * @param chainId Destination chain ID
     * @param nonce Payment nonce
     */
    function cancelPayment(uint64 chainId, uint256 nonce) external onlyOwner {
        CrossChainPayment storage payment = crossChainPayments[chainId][nonce];
        require(!payment.processed, "Payment already processed");
        require(payment.sender != address(0), "Payment does not exist");
        
        // Return tokens to sender
        IERC20(payment.token).transfer(payment.sender, payment.amount);
        
        // Mark as processed to prevent reuse
        payment.processed = true;
    }
    
    /**
     * @dev Withdraws stuck tokens (emergency function)
     * @param token Token address
     * @param amount Amount to withdraw
     */
    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
    
    /**
     * @dev Allows contract to receive ETH
     */
    receive() external payable {
        // Just accept the ETH
    }
}