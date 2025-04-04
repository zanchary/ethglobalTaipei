// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.28;

/**
 * @title IWorldIDVerifier
 * @dev Interface for interacting with World ID verification
 */
interface IWorldIDVerifier {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external view returns (bool);
}

/**
 * @title IEventTicketingApp
 * @dev Interface for the main event ticketing application
 */
interface IEventTicketingApp {
    function getEventOrganizer(uint256 eventId) external view returns (address);
    function isEventActive(uint256 eventId) external view returns (bool);
    function getEventResaleFeePercent(uint256 eventId) external view returns (uint256);
    function platformFeePercent() external view returns (uint256);
    function platformFeeAddress() external view returns (address);
    function verifyTicketOwnership(uint256 tokenId, address owner) external view returns (bool);
    function getEventInfo(uint256 eventId) external view returns (
        string memory name,
        string memory description,
        string memory location,
        uint256 date,
        bool allowResale,
        uint256 resaleDeadline,
        bool dynamicNFTEnabled
    );
}

/**
 * @title IEventTicketNFT
 * @dev Interface for the NFT ticket contract
 */
interface IEventTicketNFT {
    function mintTicket(
        address to,
        uint256 eventId,
        uint256 ticketTypeId,
        string calldata eventName,
        string calldata ticketTypeName,
        uint256 eventDate,
        string calldata eventLocation,
        bool isResellable,
        uint256 originalPrice
    ) external returns (uint256);
    
    function markAttended(uint256 tokenId) external;
    function updateTicketMetadata(uint256 tokenId, string calldata newEventName, string calldata newTicketTypeName, string calldata newEventLocation) external;
    function getTicketEventId(uint256 tokenId) external view returns (uint256);
    function getTicketTypeId(uint256 tokenId) external view returns (uint256);
    function isTicketAttended(uint256 tokenId) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title IEventTicketPayment
 * @dev Interface for the payment contract
 */
interface IEventTicketPayment {
    enum PaymentType { TicketPurchase, TicketResale, Refund }
    
    function processTicketPurchase(
        uint256 eventId,
        uint256 ticketTypeId,
        address buyer,
        uint256 amount
    ) external payable returns (uint256);
    
    function processTicketResale(
        uint256 eventId,
        uint256 tokenId,
        address seller,
        address buyer,
        uint256 amount
    ) external payable returns (uint256);
    
    function processRefund(
        uint256 eventId,
        uint256 tokenId,
        address buyer,
        uint256 amount
    ) external returns (uint256);
}

/**
 * @title DataTypes
 * @dev Contract containing shared data structures
 */
contract DataTypes {
    // Struct definitions for events
    struct EventInfo {
        uint256 id;
        string name;
        string description;
        string location;
        uint256 date;
        uint256 totalTickets;
        uint256 ticketsSold;
        address organizer;
        bool isActive;
        bool worldIDVerified;
        bool allowResale;
        uint256 resaleDeadline;
        uint256 resaleFeePercent;
        bool dynamicNFTEnabled;
    }
    
    struct TicketType {
        uint256 id;
        string name;
        uint256 price;
        uint256 totalSupply;
        uint256 sold;
        bool exists;
    }
    
    struct TicketMetadata {
        uint256 eventId;
        uint256 ticketTypeId;
        string eventName;
        string ticketTypeName;
        uint256 eventDate;
        string eventLocation;
        bool attended;
        bool isResellable;
        uint256 originalPrice;
        uint256 resalePrice;
        address originalOwner;
    }
    
    struct Payment {
        uint256 id;
        uint256 eventId;
        uint256 ticketTypeId;
        address buyer;
        uint256 amount;
        bool completed;
        uint256 platformFee;
        uint256 organizerAmount;
        uint256 timestamp;
        IEventTicketPayment.PaymentType paymentType;
    }
}

/**
 * @title StringUtils
 * @dev Library for string manipulation utilities
 */
library StringUtils {
    /**
     * @dev Converts uint256 to string
     * @param value The uint256 value to convert
     */
    function toString(uint256 value) internal pure returns (string memory) {
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
     * @dev Converts address to hex string
     * @param value The address to convert
     */
    function toHexString(uint160 value) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(value >> (8 * (19 - i)));
            buffer[2 + i * 2] = toHexChar(b >> 4);
            buffer[3 + i * 2] = toHexChar(b & 0x0f);
        }
        
        return string(buffer);
    }
    
    /**
     * @dev Converts byte to hex character
     * @param b The byte to convert
     */
    function toHexChar(uint8 b) internal pure returns (bytes1) {
        if (b < 10) {
            return bytes1(uint8(b + 48));
        } else {
            return bytes1(uint8(b + 87));
        }
    }
}