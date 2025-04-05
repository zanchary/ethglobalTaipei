// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./EventTicketNFT.sol";
import "./WorldIDVerifier.sol";
import "./CrossChainBridge.sol";

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
    
    // Reference to the cross-chain bridge contract
    CrossChainBridge public crossChainBridge;
    
    // Simple counter for event IDs
    uint256 public nextEventId;
    
    // Platform fee percentage (in basis points, 100 = 1%)
    uint256 public platformFeePercentage = 200; // 2% default
    
    // Struct to represent an event
    struct Event {
        string name;
        string description;
        uint256 eventDate;
        uint256 totalTickets;
        uint256 ticketsSold;
        uint256 ticketPrice;
        address organizer;
        bool isActive; // Whether the event is active or cancelled
        mapping(address => bool) verifiedAttendees; // Track attendance
        bool worldIdRequired; // Whether World ID verification is required
    }
    
    // Mapping from event ID to Event details
    mapping(uint256 => Event) public events;
    
    // Mapping from organizer address to verified status
    mapping(address => bool) public verifiedOrganizers;
    
    // Mapping from user address to loyalty points
    mapping(address => uint256) public loyaltyPoints;
    
    // Platform admin address for fee collection
    address payable public platformAdmin;
    
    // Action ID for World ID verification
    string public constant WORLD_ID_ACTION = "purchase-ticket";
    
    // Struct to hold event creation parameters
    struct EventCreationParams {
        string name;
        string description;
        uint256 eventDate;
        uint256 totalTickets;
        uint256 ticketPrice;
        bool worldIdRequired;
    }
    
    // Events for tracking actions
    event EventCreated(
        uint256 indexed eventId,
        string name,
        string description,
        uint256 eventDate,
        uint256 totalTickets,
        uint256 ticketPrice,
        address indexed organizer,
        bool worldIdRequired
    );
    
    event OrganizerVerified(address indexed organizer);
    
    event TicketMinted(
        uint256 indexed tokenId,
        uint256 indexed eventId,
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
    
    event CrossChainPaymentProcessed(
        bytes32 indexed paymentId,
        uint256 indexed eventId,
        address indexed buyer,
        uint256 tokenId
    );
    
    /**
     * @dev Constructor for the main ticketing contract
     * @param _ticketNFT Address of the ticket NFT contract
     * @param _worldIDVerifier Address of the World ID verifier contract
     * @param _crossChainBridge Address of the cross-chain bridge contract
     */
    constructor(
        address _ticketNFT,
        address _worldIDVerifier,
        address payable _crossChainBridge
    ) Ownable(msg.sender) {
        ticketNFT = EventTicketNFT(_ticketNFT);
        worldIDVerifier = WorldIDVerifier(_worldIDVerifier);
        crossChainBridge = CrossChainBridge(_crossChainBridge);
        platformAdmin = payable(msg.sender);
        
        // Register the purchase ticket action with World ID
        try worldIDVerifier.registerAction(WORLD_ID_ACTION) {} catch {}
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
     * @dev Updates the platform admin address.
     * @param newAdmin The new admin address.
     */
    function updatePlatformAdmin(address payable newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid address");
        platformAdmin = newAdmin;
    }
    
    /**
     * @dev Updates the cross-chain bridge contract address
     * @param _crossChainBridge Address of the new cross-chain bridge contract
     */
    function updateCrossChainBridge(address payable _crossChainBridge) external onlyOwner {
        require(_crossChainBridge != address(0), "Invalid bridge address");
        crossChainBridge = CrossChainBridge(_crossChainBridge);
    }
    
    /**
     * @dev Allows verified organizers to create events.
     * @param name The name of the event.
     * @param description A description of the event.
     * @param eventDate Timestamp of when the event will occur.
     * @param totalTickets The total number of tickets available.
     * @param ticketPrice The price per ticket in wei.
     * @param worldIdRequired Whether World ID verification is required for purchase.
     * @param organizer The address of the event organizer.
     * @return The ID of the created event.
     */
    function createEvent(
        string memory name,
        string memory description,
        uint256 eventDate,
        uint256 totalTickets,
        uint256 ticketPrice,
        bool worldIdRequired,
        address organizer
    ) public returns (uint256) {
        require(totalTickets > 0, "Total tickets must be greater than zero");
        require(ticketPrice > 0, "Ticket price must be greater than zero");
        require(eventDate > block.timestamp, "Event date must be in the future");
        require(organizer != address(0), "Organizer address cannot be zero");
        
        uint256 eventId = nextEventId;
        nextEventId++;
        
        Event storage newEvent = events[eventId];
        newEvent.name = name;
        newEvent.description = description;
        newEvent.eventDate = eventDate;
        newEvent.totalTickets = totalTickets;
        newEvent.ticketsSold = 0;
        newEvent.ticketPrice = ticketPrice;
        newEvent.organizer = organizer;
        newEvent.isActive = true;
        newEvent.worldIdRequired = worldIdRequired;
        
        emit EventCreated(
            eventId,
            name,
            description,
            eventDate,
            totalTickets,
            ticketPrice,
            organizer,
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
        
        // Generate simple ticket URI
        string memory ticketURI = string(abi.encodePacked(
            "ticket://", 
            _toString(eventId),
            "/",
            _toString(ticketIndex)
        ));
        
        // Mint the NFT ticket
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

    function generateQRCodeData(uint256 tokenId) public view returns (bytes memory) {
        address owner = ticketNFT.ownerOf(tokenId);
        EventTicketNFT.TicketInfo memory ticket = ticketNFT.getTicketInfo(tokenId);
        uint256 eventId = ticket.eventId;
        uint256 timestamp = block.timestamp;
        
        bytes32 checksum = keccak256(abi.encodePacked(tokenId, owner, eventId, address(this), timestamp));
        
        return abi.encode(tokenId, eventId, timestamp, checksum);
    }

    function verifyQRCode(bytes memory qrData, uint256 maxAgeSeconds) public view returns (
        bool isValid,
        uint256 tokenId,
        uint256 eventId,
        address owner
    ) {
        uint256 timestamp;
        bytes32 receivedChecksum;
        (tokenId, eventId, timestamp, receivedChecksum) = abi.decode(qrData, (uint256, uint256, uint256, bytes32));

        if (block.timestamp > timestamp + maxAgeSeconds) {
            return (false, tokenId, eventId, address(0));
        }

        try ticketNFT.ownerOf(tokenId) returns (address ticketOwner) {
            owner = ticketOwner;
        } catch {
            return (false, tokenId, eventId, address(0));
        }

        EventTicketNFT.TicketInfo memory ticket = ticketNFT.getTicketInfo(tokenId);
        if (ticket.eventId != eventId || ticketNFT.isTicketUsed(tokenId)) {
            return (false, tokenId, eventId, owner);
        }

        bytes32 calculatedChecksum = keccak256(abi.encodePacked(tokenId, owner, eventId, address(this), timestamp));
        isValid = (calculatedChecksum == receivedChecksum);

        return (isValid, tokenId, eventId, owner);
    }

    // Helper function to convert bytes32 to string
    function _bytes32ToString(bytes32 data) internal pure returns (string memory) {
        return string(abi.encodePacked("0x", _toHexString(uint256(data), 32)));
    }

    // Helper function to convert string to bytes32
    function _stringToBytes32(string memory str) internal pure returns (bytes32 result) {
        // Remove "0x" prefix if present
        if (bytes(str)[0] == "0" && bytes(str)[1] == "x") {
            str = _substring(str, 2, bytes(str).length);
        }

        bytes memory strBytes = bytes(str);
        assembly {
            result := mload(add(str, 32))
        }
    }

    // Helper function to split a string
    function _split(string memory str, string memory delimiter) internal pure returns (string[] memory) {
        // Count delimiters to determine array size
        uint count = 1;
        bytes memory strBytes = bytes(str);
        bytes memory delimiterBytes = bytes(delimiter);

        for (uint i = 0; i < strBytes.length - delimiterBytes.length + 1; i++) {
            bool found = true;
            for (uint j = 0; j < delimiterBytes.length; j++) {
                if (strBytes[i + j] != delimiterBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                count++;
                i += delimiterBytes.length - 1;
            }
        }

        // Split string
        string[] memory parts = new string[](count);
        uint partIndex = 0;
        uint lastIndex = 0;

        for (uint i = 0; i < strBytes.length - delimiterBytes.length + 1; i++) {
            bool found = true;
            for (uint j = 0; j < delimiterBytes.length; j++) {
                if (strBytes[i + j] != delimiterBytes[j]) {
                    found = false;
                    break;
                }
            }

            if (found) {
                parts[partIndex] = _substring(str, lastIndex, i);
                lastIndex = i + delimiterBytes.length;
                partIndex++;
                i += delimiterBytes.length - 1;
            }
        }

        // Add the last part
        parts[partIndex] = _substring(str, lastIndex, strBytes.length);

        return parts;
    }

    // Helper function to get substring
    function _substring(string memory str, uint startIndex, uint endIndex) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(endIndex - startIndex);
        for (uint i = startIndex; i < endIndex; i++) {
            result[i - startIndex] = strBytes[i];
        }
        return string(result);
    }

    // Helper function to convert string to uint
    function _stringToUint(string memory s) internal pure returns (uint256) {
        bytes memory b = bytes(s);
        uint256 result = 0;
        for (uint i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 48 && c <= 57) {
                result = result * 10 + (c - 48);
            }
        }
        return result;
    }

    // Helper function for hex representation
    function _toHexString(uint256 value, uint256 length) internal pure returns (string memory) {
        bytes memory buffer = new bytes(2 * length);
        for (uint256 i = 2 * length; i > 0; i--) {
            buffer[i - 1] = _toHexChar(uint8(value & 0xf));
            value >>= 4;
        }
        return string(buffer);
    }

    // Helper for hex character conversion
    function _toHexChar(uint8 value) internal pure returns (bytes1) {
        if (value < 10) {
            return bytes1(uint8(bytes1('0')) + value);
        } else {
            return bytes1(uint8(bytes1('a')) + value - 10);
        }
    }
    
    /**
     * @dev Contract can receive ETH for refunds
     */
    receive() external payable {
        // Allow contract to receive ETH for potential refunds
    }

    /**
     * @dev Processes a cross-chain payment and mints a ticket
     * @param paymentId ID of the cross-chain payment
     * @return The token ID of the minted ticket
     */
    function processCrossChainPayment(bytes32 paymentId) 
        external 
        nonReentrant 
        returns (uint256) 
    {
        // Get payment info from the bridge
        CrossChainBridge.PaymentInfo memory payment = crossChainBridge.getPaymentInfo(paymentId);
        
        // Verify payment exists and is not processed
        require(payment.timestamp > 0, "Payment does not exist");
        require(!payment.isProcessed, "Payment already processed");
        
        uint256 eventId = payment.eventId;
        Event storage evt = events[eventId];
        
        // Verify event is active and tickets are available
        require(evt.isActive, "Event is not active");
        require(evt.ticketsSold < evt.totalTickets, "No more tickets available");
        require(block.timestamp < evt.eventDate, "Event has already occurred");
        
        // Convert amount from source chain to target chain
        uint256 convertedAmount = crossChainBridge.convertAmount(payment.sourceChainId, payment.amount);
        
        // Check converted amount matches ticket price
        require(convertedAmount >= evt.ticketPrice, "Insufficient payment amount");
        
        // Check World ID verification if required
        if (evt.worldIdRequired) {
            require(
                worldIDVerifier.isVerified(payment.payer),
                "World ID verification required"
            );
        }
        
        // Mark payment as processed in the bridge
        crossChainBridge.markPaymentAsProcessed(paymentId);
        
        // Mint the ticket
        uint256 ticketIndex = evt.ticketsSold;
        evt.ticketsSold++;
        
        // Calculate platform fee
        uint256 platformFee = (evt.ticketPrice * platformFeePercentage) / 10000;
        uint256 organizerAmount = evt.ticketPrice - platformFee;
        
        // Transfer platform fee to admin (from this contract's balance)
        (bool feeSuccess, ) = platformAdmin.call{value: platformFee}("");
        require(feeSuccess, "Platform fee transfer failed");
        
        // Transfer remaining amount to organizer
        (bool paySuccess, ) = payable(evt.organizer).call{value: organizerAmount}("");
        require(paySuccess, "Organizer payment failed");
        
        // Generate simple ticket URI
        string memory ticketURI = string(abi.encodePacked(
            "ticket://", 
            _toString(eventId),
            "/",
            _toString(ticketIndex)
        ));
        
        // Mint the NFT ticket
        uint256 tokenId = ticketNFT.mintTicket(
            payment.payer, 
            eventId, 
            ticketIndex, 
            evt.ticketPrice,
            ticketURI
        );
        
        // Award loyalty points
        loyaltyPoints[payment.payer]++;
        emit LoyaltyPointsEarned(payment.payer, 1);
        
        emit TicketMinted(tokenId, eventId, payment.payer, evt.ticketPrice);
        
        emit CrossChainPaymentProcessed(paymentId, eventId, payment.payer, tokenId);
        
        return tokenId;
    }
}