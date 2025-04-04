// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EventTicketing
 * @dev A smart contract for an event ticketing platform where verified organizers can create events,
 * and tickets are issued as ERC721 NFTs with enhanced features.
 */
contract EventTicketing is ERC721URIStorage, Ownable, ReentrancyGuard {
    // Simple counters without the Counter library
    uint256 public nextEventId;
    uint256 public nextTokenId;
    
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
    }
    
    // Struct for ticket metadata
    struct TicketInfo {
        uint256 eventId;
        uint256 ticketIndex;
        uint256 purchasePrice;
        bool isUsed; // Whether the ticket has been used for entry
        bool isForSale; // Whether the ticket is listed for resale
        uint256 resalePrice; // Price if listed for resale
    }
    
    // Mapping from event ID to Event details
    mapping(uint256 => Event) public events;
    
    // Mapping from token ID to ticket info
    mapping(uint256 => TicketInfo) public ticketInfo;
    
    // Mapping from organizer address to verified status
    mapping(address => bool) public verifiedOrganizers;
    
    // Mapping from user address to loyalty points
    mapping(address => uint256) public loyaltyPoints;
    
    // Platform admin address for fee collection
    address payable public platformAdmin;
    
    // Events for tracking actions
    event EventCreated(
        uint256 indexed eventId,
        string name,
        uint256 totalTickets,
        uint256 ticketPrice,
        address indexed organizer,
        uint256 eventDate
    );
    
    event OrganizerVerified(address indexed organizer);
    
    event TicketMinted(
        uint256 indexed tokenId,
        uint256 indexed eventId,
        address indexed buyer,
        uint256 price
    );
    
    event TicketTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to
    );
    
    event TicketUsed(uint256 indexed tokenId, uint256 indexed eventId);
    
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
     * @dev Constructor initializes the ERC721 token with name "WorldTickets" and symbol "WTKT".
     */
    constructor() ERC721("WorldTickets", "WTKT") Ownable(msg.sender) {
        platformAdmin = payable(msg.sender);
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
     * @dev Allows platform admin to verify an organizer.
     * In a real implementation, this would integrate with World ID verification.
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
        string memory eventURI
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
        
        emit EventCreated(eventId, name, totalTickets, ticketPrice, msg.sender, eventDate);
        
        return eventId;
    }
    
    /**
     * @dev Allows users to buy a ticket for an event by paying the ticket price.
     * @param eventId The ID of the event to buy a ticket for.
     * @return The token ID of the minted ticket.
     */
    function buyTicket(uint256 eventId) public payable nonReentrant returns (uint256) {
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
        
        // Mint the NFT ticket
        uint256 tokenId = nextTokenId;
        nextTokenId++;
        
        _mint(msg.sender, tokenId);
        
        // Store ticket information
        ticketInfo[tokenId] = TicketInfo({
            eventId: eventId,
            ticketIndex: ticketIndex,
            purchasePrice: msg.value,
            isUsed: false,
            isForSale: false,
            resalePrice: 0
        });
        
        // Award loyalty points (1 point per purchase)
        loyaltyPoints[msg.sender]++;
        emit LoyaltyPointsEarned(msg.sender, 1);
        
        emit TicketMinted(tokenId, eventId, msg.sender, msg.value);
        
        return tokenId;
    }
    
    /**
     * @dev Helper function to check if the caller is approved or the owner of the token.
     * @param spender The address to check.
     * @param tokenId The ID of the token to check.
     * @return Whether the spender is approved or owner.
     */
    function isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner || 
                getApproved(tokenId) == spender || 
                isApprovedForAll(owner, spender));
    }
    
    /**
     * @dev Checks if a token exists by trying to get its owner.
     * @param tokenId The ID of the token to check.
     * @return Whether the token exists.
     */
    function tokenExists(uint256 tokenId) internal view returns (bool) {
        if (tokenId >= nextTokenId) {
            return false;
        }
        try this.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * @dev Allows ticket owners to list their tickets for resale.
     * @param tokenId The ID of the ticket to resell.
     * @param price The resale price.
     */
    function listTicketForResale(uint256 tokenId, uint256 price) public {
        require(isApprovedOrOwner(msg.sender, tokenId), "Not ticket owner");
        
        TicketInfo storage ticket = ticketInfo[tokenId];
        uint256 eventId = ticket.eventId;
        Event storage evt = events[eventId];
        
        require(evt.isActive, "Event is not active");
        require(evt.isResellAllowed, "Resale not allowed for this event");
        require(!ticket.isUsed, "Ticket has already been used");
        require(block.timestamp < evt.resaleDeadline, "Resale deadline passed");
        
        // Check that resale price is not too high
        uint256 maxPrice = ticket.purchasePrice + ((ticket.purchasePrice * maxResalePriceIncrease) / 10000);
        require(price <= maxPrice, "Resale price too high");
        
        ticket.isForSale = true;
        ticket.resalePrice = price;
        
        emit TicketListedForResale(tokenId, price);
    }
    /**
     * @dev Custom function to manually track token transfers.
     * Use this instead of overriding the transfer functions.
     * @param from The address transferring the token
     * @param to The address receiving the token
     * @param tokenId The ID of the transferred token
     */
    function _trackTicketTransfer(address from, address to, uint256 tokenId) internal {
        emit TicketTransferred(tokenId, from, to);
    }

    /**
     * @dev Allows users to buy a resale ticket.
     * @param tokenId The ID of the ticket to purchase.
     */
    function buyResaleTicket(uint256 tokenId) public payable nonReentrant {
        TicketInfo storage ticket = ticketInfo[tokenId];
        require(ticket.isForSale, "Ticket not for sale");

        uint256 eventId = ticket.eventId;
        Event storage evt = events[eventId];

        require(evt.isActive, "Event is not active");
        require(block.timestamp < evt.eventDate, "Event has already occurred");
        require(block.timestamp < evt.resaleDeadline, "Resale deadline passed");
        require(msg.value == ticket.resalePrice, "Incorrect payment");

        address seller = ownerOf(tokenId);
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

        // Transfer the ticket
        ticket.isForSale = false;
        ticket.resalePrice = 0;

        _transfer(seller, msg.sender, tokenId);

        // Track the transfer with our custom event
        _trackTicketTransfer(seller, msg.sender, tokenId);

        emit TicketResold(tokenId, seller, msg.sender, msg.value);
    }
    
    /**
     * @dev Cancels a ticket listing.
     * @param tokenId The ID of the ticket to delist.
     */
    function cancelResaleListing(uint256 tokenId) public {
        require(isApprovedOrOwner(msg.sender, tokenId), "Not ticket owner");
        
        TicketInfo storage ticket = ticketInfo[tokenId];
        require(ticket.isForSale, "Ticket not listed for resale");
        
        ticket.isForSale = false;
        ticket.resalePrice = 0;
    }
    
    /**
     * @dev Allows organizers to mark tickets as used when attendees check in.
     * @param tokenId The ID of the ticket to mark as used.
     */
    function useTicket(uint256 tokenId) public {
        TicketInfo storage ticket = ticketInfo[tokenId];
        uint256 eventId = ticket.eventId;
        
        require(events[eventId].organizer == msg.sender, "Not the event organizer");
        require(!ticket.isUsed, "Ticket already used");
        require(events[eventId].isActive, "Event is not active");
        
        ticket.isUsed = true;
        events[eventId].verifiedAttendees[ownerOf(tokenId)] = true;
        
        // Award additional loyalty points for attendance (2 points)
        loyaltyPoints[ownerOf(tokenId)] += 2;
        emit LoyaltyPointsEarned(ownerOf(tokenId), 2);
        
        emit TicketUsed(tokenId, eventId);
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
        require(isApprovedOrOwner(msg.sender, tokenId), "Not ticket owner");
        
        TicketInfo storage ticket = ticketInfo[tokenId];
        uint256 eventId = ticket.eventId;
        Event storage evt = events[eventId];
        
        require(!evt.isActive, "Event not cancelled");
        require(!ticket.isUsed, "Ticket already used");
        
        // Mark ticket as used to prevent double refunds
        ticket.isUsed = true;
        
        // Transfer refund from organizer's deposit or contract balance
        // In a production system, you'd need to escrow funds or have a refund mechanism
        // For simplicity, this example assumes the contract has funds for refunds
        
        // Send refund to ticket owner
        (bool success, ) = payable(msg.sender).call{value: ticket.purchasePrice}("");
        require(success, "Refund failed");
        
        emit RefundIssued(tokenId, msg.sender, ticket.purchasePrice);
    }
    
    /**
     * @dev Updates the URI for a specific token (for dynamic NFT metadata).
     * @param tokenId The ID of the token to update.
     * @param tokenURI The new URI.
     */
    function setTicketURI(uint256 tokenId, string memory tokenURI) public {
        TicketInfo storage ticket = ticketInfo[tokenId];
        uint256 eventId = ticket.eventId;
        
        require(events[eventId].organizer == msg.sender, "Not the event organizer");
        
        _setTokenURI(tokenId, tokenURI);
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
        bool isActive
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
            evt.isActive
        );
    }
    
    /**
     * @dev Gets the event ID and other info for a given ticket.
     * @param tokenId The ID of the ticket NFT.
     * @return eventId The associated event ID
     * @return ticketIndex The ticket's index within the event
     * @return purchasePrice Original purchase price
     * @return isUsed Whether the ticket has been used
     * @return isForSale Whether the ticket is for sale
     * @return resalePrice Current resale price (if applicable)
     */
    function getTicketDetails(uint256 tokenId) public view returns (
        uint256 eventId,
        uint256 ticketIndex,
        uint256 purchasePrice,
        bool isUsed,
        bool isForSale,
        uint256 resalePrice
    ) {
        TicketInfo storage ticket = ticketInfo[tokenId];
        
        return (
            ticket.eventId,
            ticket.ticketIndex,
            ticket.purchasePrice,
            ticket.isUsed,
            ticket.isForSale,
            ticket.resalePrice
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
        // Check if token exists - if ownerOf doesn't revert, the token exists
        address owner;
        try this.ownerOf(tokenId) returns (address _owner) {
            owner = _owner;
        } catch {
            revert("Ticket does not exist");
        }
        
        // Create a checksum combining token ID, owner, and timestamp
        return keccak256(abi.encodePacked(tokenId, owner, address(this), timestamp));
    }
    // Add this to your EventTicketing contract
    receive() external payable {
}
}