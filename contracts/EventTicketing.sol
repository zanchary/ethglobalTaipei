// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./EventTicketNFT.sol";
import "./WorldIDVerifier.sol";

/**
 * @title EventTicketing
 * @dev Main contract for the event ticketing platform with separated NFT logic
 * and World ID verification integration
 */
contract EventTicketing is Ownable, ReentrancyGuard {
    // Reference to the NFT contract
    EventTicketNFT public ticketNFT;
    
    // Reference to the World ID verifier contract
    WorldIDVerifier public worldIDVerifier;
    
    // Simple counter for event IDs
    uint256 public nextEventId;
    
    // Platform fee percentage (in basis points, 100 = 1%)
    uint256 public platformFeePercentage = 200; // 2% default
    
    // Maximum resale price increase (in basis points, 5000 = 50%)
    uint256 public maxResalePriceIncrease = 5000; // 50% default
    
    // Struct to represent an event
    struct Event {
        string name;
        string description;
        uint256 eventDate;
        uint256 totalTickets;
        uint256 ticketsSold;
        uint256 ticketPrice;
        address organizer;
        bool isResellAllowed;
        uint256 resaleDeadline; // Timestamp after which resale is not allowed
        string eventURI; // URI for event metadata/image
        bool isActive; // Whether the event is active or cancelled
        mapping(address => bool) verifiedAttendees; // Track attendance
        bool worldIdRequired; // Whether World ID verification is required
    }
    
    // Struct for tickets listed for resale
    struct ResaleTicket {
        uint256 tokenId;
        uint256 price;
        bool isListed;
    }
    
    // Mapping from event ID to Event details
    mapping(uint256 => Event) public events;
    
    // Mapping from token ID to resale information
    mapping(uint256 => ResaleTicket) public resaleTickets;
    
    // Mapping from organizer address to verified status
    mapping(address => bool) public verifiedOrganizers;
    
    // Mapping from user address to loyalty points
    mapping(address => uint256) public loyaltyPoints;
    
    // Platform admin address for fee collection
    address payable public platformAdmin;
    
    // Action ID for World ID verification
    string public constant WORLD_ID_ACTION = "purchase-ticket";
    
    // Events for tracking actions
    event EventCreated(
        uint256 indexed eventId,
        string name,
        uint256 totalTickets,
        uint256 ticketPrice,
        address indexed organizer,
        uint256 eventDate,
        bool worldIdRequired
    );
    
    event OrganizerVerified(address indexed organizer);
    
    event TicketMinted(
        uint256 indexed tokenId,
        uint256 indexed eventId,
        address indexed buyer,
        uint256 price
    );
    
    event TicketListedForResale(
        uint256 indexed tokenId,
        uint256 price
    );
    
    event TicketResold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price
    );
    
    event EventCancelled(uint256 indexed eventId);
    
    event RefundIssued(
        uint256 indexed tokenId,
        address indexed ticketOwner,
        uint256 amount
    );
    
    event LoyaltyPointsEarned(address indexed user, uint256 points);
    
    /**
     * @dev Constructor for the main ticketing contract
     * @param _ticketNFT Address of the ticket NFT contract
     * @param _worldIDVerifier Address of the World ID verifier contract
     */
    constructor(
        address _ticketNFT,
        address _worldIDVerifier
    ) Ownable(msg.sender) {
        ticketNFT = EventTicketNFT(_ticketNFT);
        worldIDVerifier = WorldIDVerifier(_worldIDVerifier);
        platformAdmin = payable(msg.sender);
        
        // Register the purchase ticket action with World ID
        try worldIDVerifier.registerAction(WORLD_ID_ACTION) {} catch {}
    }
    
    /**
     * @dev Modifier to check if the sender is a verified organizer.
     */
    modifier onlyVerifiedOrganizer() {
        require(verifiedOrganizers[msg.sender], "Not a verified organizer");
        _;
    }
    
    /**
     * @dev Modifier to check if the sender is the organizer of an event.
     */
    modifier onlyEventOrganizer(uint256 eventId) {
        require(events[eventId].organizer == msg.sender, "Not the event organizer");
        _;
    }
    
    /**
     * @dev Modifier to check if World ID verification is required and fulfilled
     */
    modifier worldIdVerifiedIfRequired(uint256 eventId) {
        if (events[eventId].worldIdRequired) {
            require(
                worldIDVerifier.isVerified(msg.sender),
                "World ID verification required"
            );
        }
        _;
    }
    
    /**
     * @dev Allows platform admin to verify an organizer.
     * @param organizer The address of the organizer to verify.
     */
    function verifyOrganizer(address organizer) external onlyOwner {
        verifiedOrganizers[organizer] = true;
        emit OrganizerVerified(organizer);
    }
    
    /**
     * @dev Sets the platform fee percentage (in basis points).
     * @param newFeePercentage The new fee percentage (e.g., 200 for 2%).
     */
    function setPlatformFeePercentage(uint256 newFeePercentage) external onlyOwner {
        require(newFeePercentage <= 1000, "Fee too high"); // Max 10%
        platformFeePercentage = newFeePercentage;
    }
    
    /**
     * @dev Sets the maximum resale price increase (in basis points).
     * @param newMaxIncrease The new maximum increase (e.g., 5000 for 50%).
     */
    function setMaxResalePriceIncrease(uint256 newMaxIncrease) external onlyOwner {
        require(newMaxIncrease <= 10000, "Increase too high"); // Max 100%
        maxResalePriceIncrease = newMaxIncrease;
    }
    
    /**
     * @dev Updates the platform admin address.
     * @param newAdmin The new admin address.
     */
    function updatePlatformAdmin(address payable newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid address");
        platformAdmin = newAdmin;
    }
    
    /**
     * @dev Allows verified organizers to create events.
     * @param name The name of the event.
     * @param description A description of the event.
     * @param eventDate Timestamp of when the event will occur.
     * @param totalTickets The total number of tickets available.
     * @param ticketPrice The price per ticket in wei.
     * @param isResellAllowed Whether tickets can be resold.
     * @param resaleDeadline Timestamp after which resale is not allowed.
     * @param eventURI URI for event metadata and image.
     * @param worldIdRequired Whether World ID verification is required for purchase.
     * @return The ID of the created event.
     */
    function createEvent(
        string memory name,
        string memory description,
        uint256 eventDate,
        uint256 totalTickets,
        uint256 ticketPrice,
        bool isResellAllowed,
        uint256 resaleDeadline,
        string memory eventURI,
        bool worldIdRequired
    ) public onlyVerifiedOrganizer returns (uint256) {
        require(totalTickets > 0, "Total tickets must be greater than zero");
        require(ticketPrice > 0, "Ticket price must be greater than zero");
        require(eventDate > block.timestamp, "Event date must be in the future");
        require(resaleDeadline <= eventDate, "Resale deadline must be before event date");
        
        uint256 eventId = nextEventId;
        nextEventId++;
        
        Event storage newEvent = events[eventId];
        newEvent.name = name;
        newEvent.description = description;
        newEvent.eventDate = eventDate;
        newEvent.totalTickets = totalTickets;
        newEvent.ticketsSold = 0;
        newEvent.ticketPrice = ticketPrice;
        newEvent.organizer = msg.sender;
        newEvent.isResellAllowed = isResellAllowed;
        newEvent.resaleDeadline = resaleDeadline;
        newEvent.eventURI = eventURI;
        newEvent.isActive = true;
        newEvent.worldIdRequired = worldIdRequired;
        
        emit EventCreated(
            eventId, 
            name, 
            totalTickets, 
            ticketPrice, 
            msg.sender, 
            eventDate,
            worldIdRequired
        );
        
        return eventId;
    }
    
    /**
     * @dev Allows users to buy a ticket for an event by paying the ticket price.
     * @param eventId The ID of the event to buy a ticket for.
     * @return The token ID of the minted ticket.
     */
    function buyTicket(uint256 eventId) 
        public 
        payable 
        nonReentrant 
        worldIdVerifiedIfRequired(eventId)
        returns (uint256) 
    {
        Event storage evt = events[eventId];
        
        require(evt.isActive, "Event is not active");
        require(evt.ticketsSold < evt.totalTickets, "No more tickets available");
        require(msg.value == evt.ticketPrice, "Incorrect payment");
        require(block.timestamp < evt.eventDate, "Event has already occurred");
        
        uint256 ticketIndex = evt.ticketsSold;
        evt.ticketsSold++;
        
        // Calculate platform fee
        uint256 platformFee = (msg.value * platformFeePercentage) / 10000;
        uint256 organizerAmount = msg.value - platformFee;
        
        // Transfer platform fee to admin
        (bool feeSuccess, ) = platformAdmin.call{value: platformFee}("");
        require(feeSuccess, "Platform fee transfer failed");
        
        // Transfer remaining amount to organizer
        (bool paySuccess, ) = payable(evt.organizer).call{value: organizerAmount}("");
        require(paySuccess, "Organizer payment failed");
        
        // Generate ticket URI (in a real system, this would create dynamic metadata)
        string memory ticketURI = string(abi.encodePacked(
            evt.eventURI, 
            "/ticket/", 
            _toString(ticketIndex)
        ));
        
        // Mint the NFT ticket through the NFT contract
        uint256 tokenId = ticketNFT.mintTicket(
            msg.sender, 
            eventId, 
            ticketIndex, 
            msg.value,
            ticketURI
        );
        
        // Award loyalty points (1 point per purchase)
        loyaltyPoints[msg.sender]++;
        emit LoyaltyPointsEarned(msg.sender, 1);
        
        emit TicketMinted(tokenId, eventId, msg.sender, msg.value);
        
        return tokenId;
    }
    
    /**
     * @dev Allows ticket owners to list their tickets for resale.
     * @param tokenId The ID of the ticket to resell.
     * @param price The resale price.
     */
    function listTicketForResale(uint256 tokenId, uint256 price) public {
        // Check ownership
        address owner = ticketNFT.ownerOf(tokenId);
        require(owner == msg.sender, "Not ticket owner");
        
        // Get ticket info from the NFT contract
        EventTicketNFT.TicketInfo memory ticket = ticketNFT.getTicketInfo(tokenId);
        uint256 eventId = ticket.eventId;
        Event storage evt = events[eventId];
        
        require(evt.isActive, "Event is not active");
        require(evt.isResellAllowed, "Resale not allowed for this event");
        require(!ticketNFT.isTicketUsed(tokenId), "Ticket has already been used");
        require(block.timestamp < evt.resaleDeadline, "Resale deadline passed");
        
        // Check that resale price is not too high
        uint256 maxPrice = ticket.purchasePrice + ((ticket.purchasePrice * maxResalePriceIncrease) / 10000);
        require(price <= maxPrice, "Resale price too high");
        
        // REMOVE THIS LINE - Don't call approve from within the contract:
        // ticketNFT.approve(address(this), tokenId);
        
        // List the ticket for resale
        resaleTickets[tokenId] = ResaleTicket({
            tokenId: tokenId,
            price: price,
            isListed: true
        });
        
        emit TicketListedForResale(tokenId, price);
    }
    
    /**
     * @dev Allows users to buy a resale ticket.
     * @param tokenId The ID of the ticket to purchase.
     */
    function buyResaleTicket(uint256 tokenId) 
        public 
        payable 
        nonReentrant 
    {
        ResaleTicket storage resale = resaleTickets[tokenId];
        require(resale.isListed, "Ticket not for sale");

        // Get ticket info and event details
        EventTicketNFT.TicketInfo memory ticket = ticketNFT.getTicketInfo(tokenId);
        uint256 eventId = ticket.eventId;
        Event storage evt = events[eventId];
        
        // Check if World ID verification is required
        if (evt.worldIdRequired) {
            require(
                worldIDVerifier.isVerified(msg.sender),
                "World ID verification required"
            );
        }

        require(evt.isActive, "Event is not active");
        require(block.timestamp < evt.eventDate, "Event has already occurred");
        require(block.timestamp < evt.resaleDeadline, "Resale deadline passed");
        require(msg.value == resale.price, "Incorrect payment");

        address seller = ticketNFT.ownerOf(tokenId);
        require(seller != msg.sender, "Cannot buy your own ticket");

        // Calculate platform fee for resale
        uint256 platformFee = (msg.value * platformFeePercentage) / 10000;
        uint256 sellerAmount = msg.value - platformFee;

        // Transfer platform fee to admin
        (bool feeSuccess, ) = platformAdmin.call{value: platformFee}("");
        require(feeSuccess, "Platform fee transfer failed");

        // Transfer remaining amount to seller
        (bool paySuccess, ) = payable(seller).call{value: sellerAmount}("");
        require(paySuccess, "Seller payment failed");

        // Update resale status
        resale.isListed = false;

        // Transfer the NFT from seller to buyer
        ticketNFT.safeTransferFrom(seller, msg.sender, tokenId);

        emit TicketResold(tokenId, seller, msg.sender, msg.value);
    }
    
    /**
     * @dev Cancels a ticket listing.
     * @param tokenId The ID of the ticket to delist.
     */
    function cancelResaleListing(uint256 tokenId) public {
        // Check ownership
        address owner = ticketNFT.ownerOf(tokenId);
        require(owner == msg.sender, "Not ticket owner");
        
        ResaleTicket storage resale = resaleTickets[tokenId];
        require(resale.isListed, "Ticket not listed for resale");
        
        resale.isListed = false;
    }
    
    /**
     * @dev Allows organizers to mark tickets as used when attendees check in.
     * @param tokenId The ID of the ticket to mark as used.
     */
    function useTicket(uint256 tokenId) public {
        // Get ticket info from the NFT contract
        EventTicketNFT.TicketInfo memory ticket = ticketNFT.getTicketInfo(tokenId);
        uint256 eventId = ticket.eventId;
        
        require(events[eventId].organizer == msg.sender, "Not the event organizer");
        require(!ticketNFT.isTicketUsed(tokenId), "Ticket already used");
        require(events[eventId].isActive, "Event is not active");
        
        // Mark the ticket as used through the NFT contract
        ticketNFT.useTicket(tokenId);
        
        // Record attendance
        address attendee = ticketNFT.ownerOf(tokenId);
        events[eventId].verifiedAttendees[attendee] = true;
        
        // Award additional loyalty points for attendance (2 points)
        loyaltyPoints[attendee] += 2;
        emit LoyaltyPointsEarned(attendee, 2);
    }
    
    /**
     * @dev Allows organizers to cancel an event and enable refunds.
     * @param eventId The ID of the event to cancel.
     */
    function cancelEvent(uint256 eventId) public onlyEventOrganizer(eventId) {
        Event storage evt = events[eventId];
        require(evt.isActive, "Event already cancelled");
        require(block.timestamp < evt.eventDate, "Event has already occurred");
        
        evt.isActive = false;
        
        emit EventCancelled(eventId);
    }
    
    /**
     * @dev Allows ticket holders to claim refunds for cancelled events.
     * @param tokenId The ID of the ticket to refund.
     */
    function claimRefund(uint256 tokenId) public nonReentrant {
        // Check ownership
        address owner = ticketNFT.ownerOf(tokenId);
        require(owner == msg.sender, "Not ticket owner");
        
        // Get ticket info from the NFT contract
        EventTicketNFT.TicketInfo memory ticket = ticketNFT.getTicketInfo(tokenId);
        uint256 eventId = ticket.eventId;
        Event storage evt = events[eventId];
        
        require(!evt.isActive, "Event not cancelled");
        require(!ticketNFT.isTicketUsed(tokenId), "Ticket already used");
        
        // Mark ticket as used to prevent double refunds
        ticketNFT.useTicket(tokenId);
        
        // Send refund to ticket owner
        (bool success, ) = payable(msg.sender).call{value: ticket.purchasePrice}("");
        require(success, "Refund failed");
        
        emit RefundIssued(tokenId, msg.sender, ticket.purchasePrice);
    }
    
    /**
     * @dev Gets information about an event.
     * @param eventId The ID of the event.
     * @return name Event name
     * @return description Event description
     * @return eventDate Event date timestamp
     * @return totalTickets Total available tickets
     * @return ticketsSold Number of tickets sold
     * @return ticketPrice Price per ticket
     * @return organizer Address of event organizer
     * @return isResellAllowed Whether resale is allowed
     * @return resaleDeadline Deadline for resales
     * @return eventURI URI for event metadata
     * @return isActive Whether the event is active
     * @return worldIdRequired Whether World ID verification is required
     */
    function getEventDetails(uint256 eventId) public view returns (
        string memory name,
        string memory description,
        uint256 eventDate,
        uint256 totalTickets,
        uint256 ticketsSold,
        uint256 ticketPrice,
        address organizer,
        bool isResellAllowed,
        uint256 resaleDeadline,
        string memory eventURI,
        bool isActive,
        bool worldIdRequired
    ) {
        Event storage evt = events[eventId];
        
        return (
            evt.name,
            evt.description,
            evt.eventDate,
            evt.totalTickets,
            evt.ticketsSold,
            evt.ticketPrice,
            evt.organizer,
            evt.isResellAllowed,
            evt.resaleDeadline,
            evt.eventURI,
            evt.isActive,
            evt.worldIdRequired
        );
    }
    
    /**
     * @dev Checks if a user has attended a specific event.
     * @param eventId The ID of the event.
     * @param user The address of the user.
     * @return Whether the user has attended the event.
     */
    function hasAttended(uint256 eventId, address user) public view returns (bool) {
        return events[eventId].verifiedAttendees[user];
    }
    
    /**
     * @dev Returns the loyalty points for a user.
     * @param user The address of the user.
     * @return The number of loyalty points.
     */
    function getUserLoyaltyPoints(address user) public view returns (uint256) {
        return loyaltyPoints[user];
    }
    
    /**
     * @dev Generates a QR code checksum for ticket verification.
     * This is meant to be used off-chain to generate and verify QR codes.
     * @param tokenId The ID of the ticket.
     * @param timestamp Current timestamp to prevent replay attacks.
     * @return A checksum that can be used to verify ticket authenticity.
     */
    function generateTicketChecksum(uint256 tokenId, uint256 timestamp) public view returns (bytes32) {
        // Get the owner of the token
        address owner = ticketNFT.ownerOf(tokenId);
        
        // Create a checksum combining token ID, owner, and timestamp
        return keccak256(abi.encodePacked(tokenId, owner, address(this), timestamp));
    }
    
    /**
     * @dev Utility function to convert a uint256 to a string.
     * @param value The uint256 to convert.
     * @return The string representation of the uint256.
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        // This function handles the conversion of a uint to a string
        if (value == 0) {
            return "0";
        }
        
        uint256 temp = value;
        uint256 digits;
        
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        
        return string(buffer);
    }
    
    /**
     * @dev Contract can receive ETH for refunds
     */
    receive() external payable {
        // Allow contract to receive ETH for potential refunds
    }
}