// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./interfaces.sol";

/**
 * @title EventTicketPayment
 * @dev Contract for handling payments for tickets across multiple chains
 */
contract EventTicketPayment is IEventTicketPayment, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    
    // State variables
    address public ticketingApp;
    Counters.Counter private _paymentIds;
    
    // Mappings
    mapping(uint256 => DataTypes.Payment) public payments;
    mapping(address => uint256[]) public userPayments;
    mapping(uint256 => uint256[]) public eventPayments;
    mapping(string => address) public priceFeedAddresses;
    
    // Events
    event PaymentProcessed(uint256 indexed paymentId, address indexed buyer, uint256 amount, PaymentType paymentType);
    event RefundIssued(uint256 indexed paymentId, address indexed buyer, uint256 amount);
    event PriceFeedAdded(string symbol, address priceFeedAddress);
    event TicketingAppSet(address ticketingApp);
    
    // Modifiers
    modifier onlyTicketingApp() {
        require(msg.sender == ticketingApp, "Only ticketing app can call this function");
        _;
    }
    
    // Constructor
    constructor() Ownable(msg.sender) {
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
     * @dev Sets price feed address for a token symbol
     * @param symbol Token symbol
     * @param priceFeedAddress Address of the Chainlink price feed
     */
    function setPriceFeed(string calldata symbol, address priceFeedAddress) external onlyOwner {
        priceFeedAddresses[symbol] = priceFeedAddress;
        emit PriceFeedAdded(symbol, priceFeedAddress);
    }
    
    /**
     * @dev Processes a ticket purchase payment
     * @param eventId ID of the event
     * @param ticketTypeId ID of the ticket type
     * @param buyer Address of the buyer
     * @param amount Payment amount
     */
    function processTicketPurchase(
        uint256 eventId,
        uint256 ticketTypeId,
        address buyer,
        uint256 amount
    ) external payable override onlyTicketingApp nonReentrant returns (uint256) {
        require(amount > 0, "Payment amount must be greater than 0");
        require(msg.value >= amount, "Insufficient payment");
        
        _paymentIds.increment();
        uint256 paymentId = _paymentIds.current();
        
        // Get platform fee from ticketing app
        IEventTicketingApp app = IEventTicketingApp(ticketingApp);
        uint256 platformFeePercent = app.platformFeePercent();
        address platformFeeAddress = app.platformFeeAddress();
        address organizer = app.getEventOrganizer(eventId);
        
        uint256 platformFee = (amount * platformFeePercent) / 10000;
        uint256 organizerAmount = amount - platformFee;
        
        DataTypes.Payment storage newPayment = payments[paymentId];
        newPayment.id = paymentId;
        newPayment.eventId = eventId;
        newPayment.ticketTypeId = ticketTypeId;
        newPayment.buyer = buyer;
        newPayment.amount = amount;
        newPayment.completed = true;
        newPayment.platformFee = platformFee;
        newPayment.organizerAmount = organizerAmount;
        newPayment.timestamp = block.timestamp;
        newPayment.paymentType = PaymentType.TicketPurchase;
        
        userPayments[buyer].push(paymentId);
        eventPayments[eventId].push(paymentId);
        
        // Send platform fee to platform fee address
        (bool platformSuccess, ) = platformFeeAddress.call{value: platformFee}("");
        require(platformSuccess, "Platform fee transfer failed");
        
        // Send organizer amount to the organizer
        (bool organizerSuccess, ) = organizer.call{value: organizerAmount}("");
        require(organizerSuccess, "Organizer payment transfer failed");
        
        emit PaymentProcessed(paymentId, buyer, amount, PaymentType.TicketPurchase);
        
        return paymentId;
    }
    
    /**
     * @dev Processes a ticket resale payment
     * @param eventId ID of the event
     * @param tokenId ID of the ticket token
     * @param seller Address of the seller
     * @param buyer Address of the buyer
     * @param amount Payment amount
     */
    function processTicketResale(
        uint256 eventId,
        uint256 tokenId,
        address seller,
        address buyer,
        uint256 amount
    ) external payable override onlyTicketingApp nonReentrant returns (uint256) {
        require(amount > 0, "Payment amount must be greater than 0");
        require(msg.value >= amount, "Insufficient payment");
        
        _paymentIds.increment();
        uint256 paymentId = _paymentIds.current();
        
        // Get platform and resale fees from ticketing app
        IEventTicketingApp app = IEventTicketingApp(ticketingApp);
        uint256 platformFeePercent = app.platformFeePercent();
        address platformFeeAddress = app.platformFeeAddress();
        address organizer = app.getEventOrganizer(eventId);
        uint256 resaleFeePercent = app.getEventResaleFeePercent(eventId);
        
        // Calculate fees
        uint256 platformFee = (amount * platformFeePercent) / 10000;
        uint256 resaleFee = (amount * resaleFeePercent) / 10000;
        uint256 sellerAmount = amount - platformFee - resaleFee;
        
        DataTypes.Payment storage newPayment = payments[paymentId];
        newPayment.id = paymentId;
        newPayment.eventId = eventId;
        newPayment.buyer = buyer;
        newPayment.amount = amount;
        newPayment.completed = true;
        newPayment.platformFee = platformFee;
        newPayment.organizerAmount = resaleFee; // In resale, this is the resale fee
        newPayment.timestamp = block.timestamp;
        newPayment.paymentType = PaymentType.TicketResale;
        
        userPayments[buyer].push(paymentId);
        eventPayments[eventId].push(paymentId);
        
        // Send platform fee to platform fee address
        (bool platformSuccess, ) = platformFeeAddress.call{value: platformFee}("");
        require(platformSuccess, "Platform fee transfer failed");
        
        // Send resale fee to the organizer
        (bool organizerSuccess, ) = organizer.call{value: resaleFee}("");
        require(organizerSuccess, "Organizer resale fee transfer failed");
        
        // Send remaining amount to the seller
        (bool sellerSuccess, ) = seller.call{value: sellerAmount}("");
        require(sellerSuccess, "Seller payment transfer failed");
        
        emit PaymentProcessed(paymentId, buyer, amount, PaymentType.TicketResale);
        
        return paymentId;
    }
    
    /**
     * @dev Processes a ticket refund
     * @param eventId ID of the event
     * @param tokenId ID of the ticket token
     * @param buyer Address of the buyer to refund
     * @param amount Refund amount
     */
    function processRefund(
        uint256 eventId,
        uint256 tokenId,
        address buyer,
        uint256 amount
    ) external override onlyTicketingApp nonReentrant returns (uint256) {
        require(amount > 0, "Refund amount must be greater than 0");
        
        _paymentIds.increment();
        uint256 paymentId = _paymentIds.current();
        
        DataTypes.Payment storage newPayment = payments[paymentId];
        newPayment.id = paymentId;
        newPayment.eventId = eventId;
        newPayment.buyer = buyer;
        newPayment.amount = amount;
        newPayment.completed = true;
        newPayment.timestamp = block.timestamp;
        newPayment.paymentType = PaymentType.Refund;
        
        userPayments[buyer].push(paymentId);
        eventPayments[eventId].push(paymentId);
        
        // Send refund to buyer
        (bool success, ) = buyer.call{value: amount}("");
        require(success, "Refund transfer failed");
        
        emit RefundIssued(paymentId, buyer, amount);
        emit PaymentProcessed(paymentId, buyer, amount, PaymentType.Refund);
        
        return paymentId;
    }
    
    /**
     * @dev Gets the current price of a token in ETH
     * @param symbol Token symbol
     */
    function getTokenPrice(string calldata symbol) external view returns (uint256, uint8) {
        address priceFeedAddress = priceFeedAddresses[symbol];
        require(priceFeedAddress != address(0), "Price feed not found for symbol");
        
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddress);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        uint8 decimals = priceFeed.decimals();
        
        return (uint256(price), decimals);
    }
    
    /**
     * @dev Gets payment information
     * @param paymentId ID of the payment
     */
    function getPaymentInfo(uint256 paymentId) external view returns (
        uint256 eventId,
        address buyer,
        uint256 amount,
        bool completed,
        uint256 timestamp,
        PaymentType paymentType
    ) {
        DataTypes.Payment storage payment = payments[paymentId];
        return (
            payment.eventId,
            payment.buyer,
            payment.amount,
            payment.completed,
            payment.timestamp,
            payment.paymentType
        );
    }
    
    /**
     * @dev Gets payments for a user
     * @param user Address of the user
     */
    function getUserPayments(address user) external view returns (uint256[] memory) {
        return userPayments[user];
    }
    
    /**
     * @dev Gets payments for an event
     * @param eventId ID of the event
     */
    function getEventPayments(uint256 eventId) external view returns (uint256[] memory) {
        return eventPayments[eventId];
    }
    
    /**
     * @dev Allows contract to receive ETH
     */
    receive() external payable {
        // Just accept the ETH
    }
}