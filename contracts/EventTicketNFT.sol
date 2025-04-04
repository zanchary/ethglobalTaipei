// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title EventTicketNFT
 * @dev NFT contract for event tickets separated from the main ticketing logic
 */
contract EventTicketNFT is ERC721URIStorage, AccessControl {
    // Define roles
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");
    
    // Simple token ID counter
    uint256 private _nextTokenId;
    
    // Ticket information storage
    struct TicketInfo {
        uint256 eventId;
        uint256 ticketIndex;
        uint256 purchasePrice;
        bool isUsed;
        address originalPurchaser;
    }
    
    // Mapping from token ID to ticket info
    mapping(uint256 => TicketInfo) private _ticketInfo;
    
    // Event when a ticket is marked as used
    event TicketUsed(uint256 indexed tokenId, uint256 indexed eventId);
    
    /**
     * @dev Constructor for the NFT contract
     */
    constructor() ERC721("WorldTickets", "WTKT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(URI_SETTER_ROLE, msg.sender);
        
        // Initialize token counter
        _nextTokenId = 0;
    }
    
    /**
     * @dev Mint a new ticket NFT for a buyer
     * @param to Address receiving the ticket
     * @param eventId ID of the associated event
     * @param ticketIndex Index of this ticket within the event
     * @param purchasePrice Price paid for the ticket
     * @param tokenURI URI for ticket metadata
     * @return tokenId The ID of the newly minted ticket
     */
    function mintTicket(
        address to, 
        uint256 eventId, 
        uint256 ticketIndex, 
        uint256 purchasePrice,
        string memory tokenURI
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        uint256 tokenId = _nextTokenId;
        _nextTokenId++;
        
        _mint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        
        _ticketInfo[tokenId] = TicketInfo({
            eventId: eventId,
            ticketIndex: ticketIndex,
            purchasePrice: purchasePrice,
            isUsed: false,
            originalPurchaser: to
        });
        
        return tokenId;
    }
    
    /**
     * @dev Custom function to check if a token exists
     * @param tokenId The ID of the token to check
     * @return Whether the token exists
     */
    function _tokenExists(uint256 tokenId) internal view returns (bool) {
        if (tokenId >= _nextTokenId) {
            return false;
        }
        try this.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * @dev Mark a ticket as used (by event organizer or ticketing contract)
     * @param tokenId The ID of the ticket to mark
     */
    function useTicket(uint256 tokenId) external onlyRole(MINTER_ROLE) {
        require(_tokenExists(tokenId), "Ticket does not exist");
        require(!_ticketInfo[tokenId].isUsed, "Ticket already used");
        
        _ticketInfo[tokenId].isUsed = true;
        
        emit TicketUsed(tokenId, _ticketInfo[tokenId].eventId);
    }
    
    /**
     * @dev Update the token URI (for dynamic NFT metadata)
     * @param tokenId The ID of the token
     * @param tokenURI The new URI
     */
    function setTicketURI(uint256 tokenId, string memory tokenURI) 
        external onlyRole(URI_SETTER_ROLE) 
    {
        require(_tokenExists(tokenId), "URI set of nonexistent token");
        _setTokenURI(tokenId, tokenURI);
    }
    
    /**
     * @dev Get information about a ticket
     * @param tokenId The ticket ID
     * @return Information about the ticket
     */
    function getTicketInfo(uint256 tokenId) external view returns (TicketInfo memory) {
        require(_tokenExists(tokenId), "Ticket does not exist");
        return _ticketInfo[tokenId];
    }
    
    /**
     * @dev Check if a ticket has been used
     * @param tokenId The ticket ID
     * @return Whether the ticket is used
     */
    function isTicketUsed(uint256 tokenId) external view returns (bool) {
        require(_tokenExists(tokenId), "Ticket does not exist");
        return _ticketInfo[tokenId].isUsed;
    }
    
    /**
     * @dev Get the original purchaser of a ticket
     * @param tokenId The ticket ID
     * @return The address of the original purchaser
     */
    function getOriginalPurchaser(uint256 tokenId) external view returns (address) {
        require(_tokenExists(tokenId), "Ticket does not exist");
        return _ticketInfo[tokenId].originalPurchaser;
    }
    
    /**
     * @dev Override required by Solidity.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}