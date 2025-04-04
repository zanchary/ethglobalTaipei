// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interfaces.sol";

/**
 * @title EventTicketingApp
 * @dev Main contract for the event ticketing application
 */
contract EventTicketingApp is IEventTicketingApp, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using StringUtils for uint256;
    using StringUtils for uint160;
    
    // State variables
    Counters.Counter private _eventIds;
    IWorldIDVerifier public worldIDVerifier;
    IEventTicketNFT public ticketNFT;
    IEventTicketPayment public paymentProcessor;
    address public platformFeeAddress;
    uint256 public override platformFeePercent = 100; // 1% (in basis points)
    
    // Constants
    uint256 private constant WORLD_ID_GROUP_ID = 1; // Example group ID for World ID
    
    // Storage for events
    struct Event {
        DataTypes.EventInfo info;
        mapping(uint256 => DataTypes.TicketType) ticketTypes;
        uint256 ticketTypeCount;
    }
    
    // Mappings
    mapping(uint256 => Event) private events;
    mapping(address => bool) public verifiedOrganizers;
    mapping(address => uint256[]) private organizerEvents;
    mapping(address => mapping(uint256 => bool)) private hasAttended;
    mapping(address => uint256) public userLoyaltyPoints;
    mapping(uint256 => uint256[]) private eventTokenIds;
    
    // Events
    event EventCreated(uint256 indexed eventId, address indexed organizer, string name);
    event TicketTypeAdded(uint256 indexed eventId, uint256 indexed ticketTypeId, string name, uint256 price);
    event OrganizerVerified(address indexed organizer);
    event TicketPurchased(uint256 indexed eventId, address indexed buyer, uint256 ticketTypeId, uint256 tokenId);
    event TicketTransferred(uint256 indexed tokenId, address indexed from, address indexed to);
    event TicketRefunded(uint256 indexed tokenId, address indexed attendee, uint256 amount);
    event TicketResold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event EventCancelled(uint256 indexed eventId);
    event AttendanceRecorded(uint256 indexed eventId, uint256 indexed tokenId, address attendee);
    event ContractsUpdated(address ticketNFT, address paymentProcessor);
    
    // Modifiers
    modifier onlyVerifiedOrganizer() {
        require(verifiedOrganizers[msg.sender], "Only verified organizers can perform this action");
        _;
    }
    
    modifier onlyEventOrganizer(uint256 eventId) {
        require(events[eventId].info.organizer == msg.sender, "Only the event organizer can perform this action");
        _;
    }
    
    modifier eventExists(uint256 eventId) {
        require(eventId > 0 && eventId <= _eventIds.current(), "Event does not exist");
        _;
    }
    
    modifier eventActive(uint256 eventId) {
        require(events[eventId].info.isActive, "Event is not active");
        _;
    }
    
    // Constructor
    constructor(address _worldIDVerifier, address _platformFeeAddress) Ownable(msg.sender) {
        worldIDVerifier = IWorldIDVerifier(_worldIDVerifier);
        platformFeeAddress = _platformFeeAddress;
    }
    
    /**
     * @dev Sets the contract addresses
     */
    function setContracts(address _ticketNFT, address _paymentProcessor) external onlyOwner {
        ticketNFT = IEventTicketNFT(_ticketNFT);
        paymentProcessor = IEventTicketPayment(_paymentProcessor);
        emit ContractsUpdated(_ticketNFT, _paymentProcessor);
    }
    
    /**
     * @dev Sets the World ID verifier contract address
     * @param _worldIDVerifier Address of the World ID verifier contract
     */
    function setWorldIDVerifier(address _worldIDVerifier) external onlyOwner {
        worldIDVerifier = IWorldIDVerifier(_worldIDVerifier);
    }
    
    /**
     * @dev Sets the platform fee percentage (in basis points)
     * @param _feePercent New fee percentage
     */
    function setPlatformFee(uint256 _feePercent) external onlyOwner {
        require(_feePercent <= 1000, "Fee cannot exceed 10%");
        platformFeePercent = _feePercent;
    }
    
    /**
     * @dev Sets the platform fee recipient address
     * @param _platformFeeAddress New fee recipient address
     */
    function setPlatformFeeAddress(address _platformFeeAddress) external onlyOwner {
        platformFeeAddress = _platformFeeAddress;
    }
    
    /**
     * @dev Returns the platform fee address
     */
    function platformFeeAddress() external view override returns (address) {
        return platformFeeAddress;
    }
    
    /**
     * @dev Verifies an organizer using World ID
     * @param root Merkle root
     * @param nullifierHash Nullifier hash
     * @param proof ZK proof
     */
    function verifyOrganizer(
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        // Generate signal hash from organizer address
        uint256 signalHash = uint256(keccak256(abi.encodePacked(msg.sender)));
        
        // Verify the proof using World ID
        require(
            worldIDVerifier.verifyProof(
                root,
                WORLD_ID_GROUP_ID,
                signalHash,
                nullifierHash,
                proof
            ),
            "World ID verification failed"
        );
        
        verifiedOrganizers[msg.sender] = true;
        emit OrganizerVerified(msg.sender);
    }
    
    /**
     * @dev Creates a new event
     * @param name Event name
     * @param description Event description
     * @param location Event location
     * @param date Event date (Unix timestamp)
     * @param allowResale Whether tickets can be resold
     * @param resaleDeadline Deadline for reselling tickets
     * @param resaleFeePercent Fee percentage for resales
     * @param dynamicNFTEnabled Whether dynamic NFT updates are enabled
     */
    function createEvent(
        string calldata name,
        string calldata description,
        string calldata location,
        uint256 date,
        bool allowResale,
        uint256 resaleDeadline,
        uint256 resaleFeePercent,
        bool dynamicNFTEnabled
    ) external onlyVerifiedOrganizer returns (uint256) {
        require(date > block.timestamp, "Event date must be in the future");
        require(resaleFeePercent <= 3000, "Resale fee cannot exceed 30%");
        
        _eventIds.increment();
        uint256 eventId = _eventIds.current();
        
        Event storage newEvent = events[eventId];
        
        newEvent.info.id = eventId;
        newEvent.info.name = name;
        newEvent.info.description = description;
        newEvent.info.location = location;
        newEvent.info.date = date;
        newEvent.info.organizer = msg.sender;
        newEvent.info.isActive = true;
        newEvent.info.worldIDVerified = true;
        newEvent.info.allowResale = allowResale;
        newEvent.info.resaleDeadline = resaleDeadline;
        newEvent.info.resaleFeePercent = resaleFeePercent;
        newEvent.info.dynamicNFTEnabled = dynamicNFTEnabled;
        
        organizerEvents[msg.sender].push(eventId);
        
        emit EventCreated(eventId, msg.sender, name);
        return eventId;
    }
    
    /**
     * @dev Adds a ticket type to an event
     * @param eventId ID of the event
     * @param name Name of the ticket type
     * @param price Price of the ticket
     * @param totalSupply Total supply of tickets
     */
    function addTicketType(
        uint256 eventId,
        string calldata name,
        uint256 price,
        uint256 totalSupply
    ) external eventExists(eventId) onlyEventOrganizer(eventId) {
        require(totalSupply > 0, "Total supply must be greater than 0");
        
        Event storage eventData = events[eventId];
        require(eventData.info.isActive, "Cannot add ticket types to inactive events");
        
        eventData.ticketTypeCount++;
        uint256 ticketTypeId = eventData.ticketTypeCount;
        
        DataTypes.TicketType storage newTicketType = eventData.ticketTypes[ticketTypeId];
        newTicketType.id = ticketTypeId;
        newTicketType.name = name;
        newTicketType.price = price;
        newTicketType.totalSupply = totalSupply;
        newTicketType.sold = 0;
        newTicketType.exists = true;
        
        eventData.info.totalTickets += totalSupply;
        
        emit TicketTypeAdded(eventId, ticketTypeId, name, price);
    }
    
    /**
     * @dev Purchases a ticket for an event
     * @param eventId ID of the event
     * @param ticketTypeId ID of the ticket type
     */
    function purchaseTicket(
        uint256 eventId,
        uint256 ticketTypeId
    ) external payable eventExists(eventId) eventActive(eventId) nonReentrant {
        Event storage eventData = events[eventId];
        DataTypes.TicketType storage ticketType = eventData.ticketTypes[ticketTypeId];
        
        require(ticketType.exists, "Ticket type does not exist");
        require(ticketType.sold < ticketType.totalSupply, "Ticket type sold out");
        require(msg.value >= ticketType.price, "Insufficient payment");
        
        // Process payment first
        uint256 paymentId = paymentProcessor.processTicketPurchase{value: msg.value}(
            eventId,
            ticketTypeId,
            msg.sender,
            ticketType.price
        );
        
        // Increase ticket sold count
        ticketType.sold++;
        eventData.info.ticketsSold++;
        
        // Mint NFT ticket
        uint256 tokenId = ticketNFT.mintTicket(
            msg.sender,
            eventId,
            ticketTypeId,
            eventData.info.name,
            ticketType.name,
            eventData.info.date,
            eventData.info.location,
            eventData.info.allowResale,
            ticketType.price
        );
        
        // Update loyalty points
        userLoyaltyPoints[msg.sender] += 10;
        
        // Track token for this event
        eventTokenIds[eventId].push(tokenId);
        
        // Return excess payment if any
        if (msg.value > ticketType.price) {
            (bool success, ) = msg.sender.call{value: msg.value - ticketType.price}("");
            require(success, "Refund failed");
        }
        
        emit TicketPurchased(eventId, msg.sender, ticketTypeId, tokenId);
    }
    
    /**
     * @dev Cancels an event
     * @param eventId ID of the event to cancel
     */
    function cancelEvent(uint256 eventId) 
        external 
        eventExists(eventId) 
        onlyEventOrganizer(eventId) 
    {
        Event storage eventData = events[eventId];
        require(eventData.info.isActive, "Event is already inactive");
        require(eventData.info.date > block.timestamp, "Cannot cancel past events");
        
        eventData.info.isActive = false;
        emit EventCancelled(eventId);
    }
    
    /**
     * @dev Lists a ticket for resale
     * @param tokenId Token ID of the ticket
     * @param price Resale price
     */
    function listTicketForResale(uint256 tokenId, uint256 price) external {
        // Check ownership
        require(ticketNFT.ownerOf(tokenId) == msg.sender, "Not the ticket owner");
        
        // Get event ID from the ticket
        uint256 eventId = ticketNFT.getTicketEventId(tokenId);
        
        // Check if the event allows reselling
        require(events[eventId].info.allowResale, "Event does not allow resale");
        
        // Check if resale deadline has not passed
        if (events[eventId].info.resaleDeadline > 0) {
            require(block.timestamp <= events[eventId].info.resaleDeadline, "Resale deadline passed");
        }
        
        // Call the NFT contract to list the ticket
        (bool success, ) = address(ticketNFT).call(
            abi.encodeWithSignature(
                "listTicketForResale(uint256,uint256)",
                tokenId,
                price
            )
        );
        require(success, "Failed to list ticket for resale");
    }
    
    /**
     * @dev Buys a ticket from resale
     * @param tokenId Token ID of the ticket
     */
    function buyResaleTicket(uint256 tokenId) external payable nonReentrant {
        // Get seller address
        address seller = ticketNFT.ownerOf(tokenId);
        require(seller != msg.sender, "Cannot buy your own ticket");
        
        // Check if the ticket is for sale
        bool isForSale;
        uint256 resalePrice;
        (isForSale, resalePrice) = getResaleInfo(tokenId);
        require(isForSale, "Ticket not for sale");
        require(msg.value >= resalePrice, "Insufficient payment");
        
        // Get event ID from the ticket
        uint256 eventId = ticketNFT.getTicketEventId(tokenId);
        
        // Process payment
        paymentProcessor.processTicketResale{value: msg.value}(
            eventId,
            tokenId,
            seller,
            msg.sender,
            resalePrice
        );
        
        // Transfer the NFT
        (bool success, ) = address(ticketNFT).call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                seller,
                msg.sender,
                tokenId
            )
        );
        require(success, "Failed to transfer ticket");
        
        // Update loyalty points
        userLoyaltyPoints[msg.sender] += 5;
        
        // Return excess payment if any
        if (msg.value > resalePrice) {
            (bool refundSuccess, ) = msg.sender.call{value: msg.value - resalePrice}("");
            require(refundSuccess, "Refund failed");
        }
        
        emit TicketResold(tokenId, seller, msg.sender, resalePrice);
    }
    
    /**
     * @dev Records attendance at an event
     * @param tokenId Token ID of the ticket
     * @param attendee Address of the ticket owner
     */
    function recordAttendance(uint256 tokenId, address attendee) external eventActive(ticketNFT.getTicketEventId(tokenId)) {
        // Only event organizer or platform admin can mark attendance
        uint256 eventId = ticketNFT.getTicketEventId(tokenId);
        require(
            msg.sender == events[eventId].info.organizer || msg.sender == owner(),
            "Not authorized to record attendance"
        );
        
        // Verify ownership
        require(ticketNFT.ownerOf(tokenId) == attendee, "Attendee is not the ticket owner");
        
        // Verify not already attended
        require(!ticketNFT.isTicketAttended(tokenId), "Attendance already recorded");
        
        // Mark as attended
        ticketNFT.markAttended(tokenId);
        
        // Record attendance in mapping
        hasAttended[attendee][eventId] = true;
        
        // Add loyalty points
        userLoyaltyPoints[attendee] += 20;
        
        emit AttendanceRecorded(eventId, tokenId, attendee);
    }
    
    /**
     * @dev Updates dynamic NFT metadata after an event
     * @param eventId ID of the event
     * @param newEventName New event name (or empty to keep current)
     */
    function updateEventNFTMetadata(
        uint256 eventId,
        string calldata newEventName,
        string calldata newEventLocation
    ) external eventExists(eventId) onlyEventOrganizer(eventId) {
        require(events[eventId].info.dynamicNFTEnabled, "Dynamic NFT updates not enabled for this event");
        require(block.timestamp > events[eventId].info.date, "Cannot update NFT metadata before event");
        
        uint256[] memory tokens = eventTokenIds[eventId];
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 tokenId = tokens[i];
            uint256 ticketTypeId = ticketNFT.getTicketTypeId(tokenId);
            string memory ticketTypeName = events[eventId].ticketTypes[ticketTypeId].name;
            
            ticketNFT.updateTicketMetadata(
                tokenId,
                newEventName,
                ticketTypeName,
                newEventLocation
            );
        }
    }
    
    /**
     * @dev Gets information about an event
     * @param eventId ID of the event
     */
    function getEventInfo(uint256 eventId) external view override returns (
        string memory name,
        string memory description,
        string memory location,
        uint256 date,
        bool allowResale,
        uint256 resaleDeadline,
        bool dynamicNFTEnabled
    ) {
        Event storage eventData = events[eventId];
        return (
            eventData.info.name,
            eventData.info.description,
            eventData.info.location,
            eventData.info.date,
            eventData.info.allowResale,
            eventData.info.resaleDeadline,
            eventData.info.dynamicNFTEnabled
        );
    }
    
    /**
     * @dev Gets the organizer of an event
     * @param eventId ID of the event
     */
    function getEventOrganizer(uint256 eventId) external view override returns (address) {
        return events[eventId].info.organizer;
    }
    
    /**
     * @dev Gets the resale fee percentage for an event
     * @param eventId ID of the event
     */
    function getEventResaleFeePercent(uint256 eventId) external view override returns (uint256) {
        return events[eventId].info.resaleFeePercent;
    }
    
    /**
     * @dev Checks if an event is active
     * @param eventId ID of the event
     */
    function isEventActive(uint256 eventId) external view override returns (bool) {
        return events[eventId].info.isActive;
    }
    
    /**
     * @dev Verifies ticket ownership
     * @param tokenId Token ID of the ticket
     * @param owner Address to verify as owner
     */
    function verifyTicketOwnership(uint256 tokenId, address owner) external view override returns (bool) {
        return ticketNFT.ownerOf(tokenId) == owner;
    }
    
    /**
     * @dev Gets information about a ticket type
     * @param eventId ID of the event
     * @param ticketTypeId ID of the ticket type
     */
    function getTicketTypeInfo(uint256 eventId, uint256 ticketTypeId) external view returns (
        string memory name,
        uint256 price,
        uint256 totalSupply,
        uint256 sold
    ) {
        DataTypes.TicketType storage ticketType = events[eventId].ticketTypes[ticketTypeId];
        return (
            ticketType.name,
            ticketType.price,
            ticketType.totalSupply,
            ticketType.sold
        );
    }
    
    /**
     * @dev Gets the events organized by an address
     * @param organizer Address of the organizer
     */
    function getOrganizerEvents(address organizer) external view returns (uint256[] memory) {
        return organizerEvents[organizer];
    }
    
    /**
     * @dev Gets resale information for a ticket
     * @param tokenId Token ID of the ticket
     */
    function getResaleInfo(uint256 tokenId) public view returns (bool isForSale, uint256 price) {
        // This would typically call the NFT contract's resale info function
        // For simplicity, we'll return dummy values
        return (true, 1 ether);
    }
}