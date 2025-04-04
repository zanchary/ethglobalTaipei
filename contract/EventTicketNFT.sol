// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces.sol";

/**
 * @title EventTicketNFT
 * @dev Contract for NFT ticket issuance and management
 */
contract EventTicketNFT is IEventTicketNFT, ERC721URIStorage, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using StringUtils for uint256;
    using StringUtils for uint160;
    
    // State variables
    Counters.Counter private _tokenIds;
    address public ticketingApp;
    
    // Mappings
    mapping(uint256 => DataTypes.TicketMetadata) public ticketMetadata;
    mapping(uint256 => mapping(uint256 => uint256[])) public eventTickets; // eventId => ticketTypeId => tokenIds
    mapping(uint256 => bool) public ticketAttended;
    mapping(uint256 => uint256) public ticketResalePrices;
    mapping(uint256 => bool) public ticketForSale;
    
    // Events
    event TicketMinted(uint256 indexed tokenId, address indexed buyer, uint256 eventId, uint256 ticketTypeId);
    event TicketAttendanceVerified(uint256 indexed tokenId, uint256 indexed eventId);
    event TicketListedForResale(uint256 indexed tokenId, uint256 price);
    event TicketResaleCancelled(uint256 indexed tokenId);
    event TicketMetadataUpdated(uint256 indexed tokenId, string newTokenURI);
    
    // Modifiers
    modifier onlyTicketingApp() {
        require(msg.sender == ticketingApp, "Only ticketing app can call this function");
        _;
    }
    
    // Constructor
    constructor(string memory name, string memory symbol) ERC721(name, symbol) Ownable(msg.sender) {
    }
    
    /**
     * @dev Sets the ticketing app address
     * @param _ticketingApp Address of the ticketing app contract
     */
    function setTicketingApp(address _ticketingApp) external onlyOwner {
        ticketingApp = _ticketingApp;
    }
    
    /**
     * @dev Mints a new ticket NFT
     * @param to Address to mint the ticket to
     * @param eventId ID of the event
     * @param ticketTypeId ID of the ticket type
     * @param eventName Name of the event
     * @param ticketTypeName Name of the ticket type
     * @param eventDate Date of the event
     * @param eventLocation Location of the event
     * @param isResellable Whether the ticket can be resold
     * @param originalPrice Original price of the ticket
     */
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
    ) external override onlyTicketingApp returns (uint256) {
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        
        _mint(to, newTokenId);
        
        DataTypes.TicketMetadata storage metadata = ticketMetadata[newTokenId];
        metadata.eventId = eventId;
        metadata.ticketTypeId = ticketTypeId;
        metadata.eventName = eventName;
        metadata.ticketTypeName = ticketTypeName;
        metadata.eventDate = eventDate;
        metadata.eventLocation = eventLocation;
        metadata.attended = false;
        metadata.isResellable = isResellable;
        metadata.originalPrice = originalPrice;
        metadata.originalOwner = to;
        
        eventTickets[eventId][ticketTypeId].push(newTokenId);
        
        string memory tokenURI = generateTokenURI(newTokenId);
        _setTokenURI(newTokenId, tokenURI);
        
        emit TicketMinted(newTokenId, to, eventId, ticketTypeId);
        
        return newTokenId;
    }
    
    /**
     * @dev Generates token URI with metadata in JSON format
     * @param tokenId ID of the token
     */
    function generateTokenURI(uint256 tokenId) internal view returns (string memory) {
        DataTypes.TicketMetadata storage metadata = ticketMetadata[tokenId];
        
        string memory qrCodeData = generateQRCodeData(tokenId);
        
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "',
                        metadata.eventName,
                        ' - ',
                        metadata.ticketTypeName,
                        '", "description": "NFT Ticket for ',
                        metadata.eventName,
                        '", "attributes": [{"trait_type": "Event ID", "value": "',
                        metadata.eventId.toString(),
                        '"}, {"trait_type": "Ticket Type", "value": "',
                        metadata.ticketTypeName,
                        '"}, {"trait_type": "Event Date", "value": "',
                        metadata.eventDate.toString(),
                        '"}, {"trait_type": "Location", "value": "',
                        metadata.eventLocation,
                        '"}, {"trait_type": "Attended", "value": "',
                        metadata.attended ? "Yes" : "No",
                        '"}, {"trait_type": "Original Owner", "value": "',
                        toHexString(uint160(metadata.originalOwner)),
                        '"}], "qrCode": "',
                        qrCodeData,
                        '"}'
                    )
                )
            )
        );
        
        return string(abi.encodePacked("data:application/json;base64,", json));
    }
    
    /**
     * @dev Generates QR code data for ticket verification
     * @param tokenId ID of the token
     */
    function generateQRCodeData(uint256 tokenId) internal view returns (string memory) {
        DataTypes.TicketMetadata storage metadata = ticketMetadata[tokenId];
        
        return string(
            abi.encodePacked(
                "https://ticketing.app/verify?contract=",
                toHexString(uint160(address(this))),
                "&tokenId=",
                tokenId.toString(),
                "&eventId=",
                metadata.eventId.toString()
            )
        );
    }
    
    /**
     * @dev Marks a ticket as attended
     * @param tokenId ID of the token
     */
    function markAttended(uint256 tokenId) external override onlyTicketingApp {
        require(_exists(tokenId), "Token does not exist");
        require(!ticketMetadata[tokenId].attended, "Ticket already marked as attended");
        
        ticketMetadata[tokenId].attended = true;
        ticketAttended[tokenId] = true;
        
        // Update token URI to reflect attendance
        string memory newTokenURI = generateTokenURI(tokenId);
        _setTokenURI(tokenId, newTokenURI);
        
        emit TicketAttendanceVerified(tokenId, ticketMetadata[tokenId].eventId);
        emit TicketMetadataUpdated(tokenId, newTokenURI);
    }
    
    /**
     * @dev Updates the ticket metadata (for dynamic NFTs)
     * @param tokenId ID of the token
     * @param newEventName New event name
     * @param newTicketTypeName New ticket type name
     * @param newEventLocation New event location
     */
    function updateTicketMetadata(
        uint256 tokenId,
        string calldata newEventName,
        string calldata newTicketTypeName,
        string calldata newEventLocation
    ) external override onlyTicketingApp {
        require(_exists(tokenId), "Token does not exist");
        
        DataTypes.TicketMetadata storage metadata = ticketMetadata[tokenId];
        
        if (bytes(newEventName).length > 0) {
            metadata.eventName = newEventName;
        }
        
        if (bytes(newTicketTypeName).length > 0) {
            metadata.ticketTypeName = newTicketTypeName;
        }
        
        if (bytes(newEventLocation).length > 0) {
            metadata.eventLocation = newEventLocation;
        }
        
        string memory newTokenURI = generateTokenURI(tokenId);
        _setTokenURI(tokenId, newTokenURI);
        
        emit TicketMetadataUpdated(tokenId, newTokenURI);
    }
    
    /**
     * @dev Lists a ticket for resale
     * @param tokenId ID of the token
     * @param price Resale price
     */
    function listTicketForResale(uint256 tokenId, uint256 price) external {
        require(ownerOf(tokenId) == msg.sender, "Not the ticket owner");
        require(ticketMetadata[tokenId].isResellable, "Ticket not resellable");
        require(!ticketMetadata[tokenId].attended, "Attended tickets cannot be resold");
        require(price > 0, "Price must be greater than 0");
        
        ticketResalePrices[tokenId] = price;
        ticketForSale[tokenId] = true;
        
        emit TicketListedForResale(tokenId, price);
    }
    
    /**
     * @dev Cancels a ticket resale listing
     * @param tokenId ID of the token
     */
    function cancelTicketResale(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not the ticket owner");
        require(ticketForSale[tokenId], "Ticket not listed for resale");
        
        ticketForSale[tokenId] = false;
        
        emit TicketResaleCancelled(tokenId);
    }
    
    /**
     * @dev Gets the event ID of a ticket
     * @param tokenId ID of the token
     */
    function getTicketEventId(uint256 tokenId) external view override returns (uint256) {
        require(_exists(tokenId), "Token does not exist");
        return ticketMetadata[tokenId].eventId;
    }
    
    /**
     * @dev Gets the ticket type ID of a ticket
     * @param tokenId ID of the token
     */
    function getTicketTypeId(uint256 tokenId) external view override returns (uint256) {
        require(_exists(tokenId), "Token does not exist");
        return ticketMetadata[tokenId].ticketTypeId;
    }
    
    /**
     * @dev Checks if a ticket has been attended
     * @param tokenId ID of the token
     */
    function isTicketAttended(uint256 tokenId) external view override returns (bool) {
        require(_exists(tokenId), "Token does not exist");
        return ticketMetadata[tokenId].attended;
    }
    
    /**
     * @dev Gets the resale info of a ticket
     * @param tokenId ID of the token
     */
    function getResaleInfo(uint256 tokenId) external view returns (bool isForSale, uint256 price) {
        require(_exists(tokenId), "Token does not exist");
        return (ticketForSale[tokenId], ticketResalePrices[tokenId]);
    }
    
    /**
     * @dev Overrides transferFrom to handle ticket transfers
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override(ERC721, IERC721) {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved or owner");
        
        // If transfer is initiated by the ticketing app (for resales), allow it
        if (msg.sender == ticketingApp) {
            _transfer(from, to, tokenId);
            
            if (ticketForSale[tokenId]) {
                ticketForSale[tokenId] = false;
            }
            
            return;
        }
        
        // For regular transfers, enforce resale restrictions
        require(ticketMetadata[tokenId].isResellable, "Ticket not transferable");
        require(!ticketMetadata[tokenId].attended, "Attended tickets cannot be transferred");
        
        _transfer(from, to, tokenId);
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