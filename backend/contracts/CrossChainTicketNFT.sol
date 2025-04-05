// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CrossChainTicketNFT
 * @dev NFT contract for event tickets with cross-chain and offline verification support
 */
contract CrossChainTicketNFT is ERC721, AccessControl {
    // Roles
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    bytes32 public constant TICKET_VERIFIER_ROLE = keccak256("TICKET_VERIFIER_ROLE");
    
    // 简单计数器，替代Counters库
    uint256 private _nextTokenId;
    
    // Address of the contract on the main chain (WorldChain)
    address public worldChainContractAddress;
    
    // ID of the Celo chain (for cross-chain messaging)
    string public celoChainId;
    
    // Secret for offline verification (hashed)
    bytes32 private _verificationSecret;
    
    // Ticket information structure
    struct TicketInfo {
        uint256 eventId;
        uint256 ticketIndex;
        uint256 purchasePrice;
        uint256 purchaseTime;
        string ticketURI;
        bool used;
    }
    
    // Mapping from token ID to ticket info
    mapping(uint256 => TicketInfo) private _tickets;
    
    // Mapping for offline-verified tickets not yet synced to the blockchain
    mapping(bytes32 => bool) private _offlineVerifiedTickets;
    
    // Events
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed owner, uint256 price);
    event TicketUsed(uint256 indexed tokenId, address indexed verifier);
    event OfflineVerificationSynced(uint256 indexed tokenId, bytes32 verificationHash, address indexed verifier);
    event WorldChainContractUpdated(address previousAddress, address newAddress);
    event VerificationSecretUpdated();
    
    /**
     * @dev Constructor for the CrossChainTicketNFT contract
     * @param name The name of the NFT collection
     * @param symbol The symbol of the NFT collection
     * @param _worldChainContractAddress The address of the corresponding contract on WorldChain (can be zero address initially)
     * @param _celoChainId The chain ID string for Celo (e.g., "celo")
     * @param initialVerificationSecret The initial secret for offline verification
     */
    constructor(
        string memory name,
        string memory symbol,
        address _worldChainContractAddress,
        string memory _celoChainId,
        bytes32 initialVerificationSecret
    ) ERC721(name, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BRIDGE_ROLE, msg.sender);
        _grantRole(TICKET_VERIFIER_ROLE, msg.sender);
        
        worldChainContractAddress = _worldChainContractAddress;
        celoChainId = _celoChainId;
        _verificationSecret = initialVerificationSecret;
        
        // 从1开始分配token ID
        _nextTokenId = 1;
    }
    
    /**
     * @dev 检查token是否存在
     * @param tokenId 票据ID
     * @return 该token是否存在
     */
    function exists(uint256 tokenId) public view returns (bool) {
        if (tokenId == 0 || tokenId >= _nextTokenId) {
            return false;
        }
        
        try this.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * @dev Update the WorldChain contract address
     * @param newWorldChainContract The new address
     */
    function updateWorldChainContract(address newWorldChainContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address previousAddress = worldChainContractAddress;
        worldChainContractAddress = newWorldChainContract;
        emit WorldChainContractUpdated(previousAddress, newWorldChainContract);
    }
    
    /**
     * @dev Update the verification secret (only admin)
     * @param newSecret The new secret for offline verification
     */
    function updateVerificationSecret(bytes32 newSecret) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _verificationSecret = newSecret;
        emit VerificationSecretUpdated();
    }
    
    /**
     * @dev Mint a new ticket NFT
     * @param to The address that will own the ticket
     * @param eventId The ID of the event
     * @param ticketIndex The index of the ticket within the event
     * @param price The purchase price
     * @param ticketURI The URI for the ticket metadata
     * @return The ID of the newly minted token
     */
    function mintTicket(
        address to,
        uint256 eventId,
        uint256 ticketIndex,
        uint256 price,
        string memory ticketURI
    ) public onlyRole(MINTER_ROLE) returns (uint256) {
        uint256 tokenId = _nextTokenId;
        _nextTokenId++;
        
        _safeMint(to, tokenId);
        
        _tickets[tokenId] = TicketInfo({
            eventId: eventId,
            ticketIndex: ticketIndex,
            purchasePrice: price,
            purchaseTime: block.timestamp,
            ticketURI: ticketURI,
            used: false
        });
        
        emit TicketMinted(tokenId, eventId, to, price);
        
        return tokenId;
    }
    
    /**
     * @dev Mint a ticket in response to a cross-chain request
     * @param to The address that will own the ticket
     * @param eventId The ID of the event
     * @param ticketIndex The index of the ticket within the event
     * @param price The purchase price
     * @param ticketURI The URI for the ticket metadata
     * @return The ID of the newly minted token
     */
    function mintTicketCrossChain(
        address to,
        uint256 eventId,
        uint256 ticketIndex,
        uint256 price,
        string memory ticketURI
    ) external onlyRole(BRIDGE_ROLE) returns (uint256) {
        return mintTicket(to, eventId, ticketIndex, price, ticketURI);
    }
    
    /**
     * @dev Mark a ticket as used
     * @param tokenId The ID of the ticket to mark as used
     */
    function useTicket(uint256 tokenId) external onlyRole(TICKET_VERIFIER_ROLE) {
        require(exists(tokenId), "Ticket does not exist");
        require(!_tickets[tokenId].used, "Ticket already used");
        
        _tickets[tokenId].used = true;
        emit TicketUsed(tokenId, msg.sender);
    }
    
    /**
     * @dev Mark a ticket as used in response to a cross-chain request
     * @param tokenId The ID of the ticket to mark as used
     */
    function useTicketCrossChain(uint256 tokenId) external onlyRole(BRIDGE_ROLE) {
        require(exists(tokenId), "Ticket does not exist");
        require(!_tickets[tokenId].used, "Ticket already used");
        
        _tickets[tokenId].used = true;
        emit TicketUsed(tokenId, msg.sender);
    }
    
    /**
     * @dev Sync offline-verified tickets to the blockchain
     * 简化版本，不使用签名验证
     * @param tokenIds Array of token IDs that were verified offline
     * @param verificationHashes Array of verification hashes
     */
    function syncOfflineVerifications(
        uint256[] calldata tokenIds,
        bytes32[] calldata verificationHashes
    ) external onlyRole(TICKET_VERIFIER_ROLE) {
        require(tokenIds.length == verificationHashes.length, "Array lengths must match");
        
        // Process each offline verification
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            bytes32 verificationHash = verificationHashes[i];
            
            require(exists(tokenId), "Ticket does not exist");
            require(!_tickets[tokenId].used, "Ticket already used");
            require(!_offlineVerifiedTickets[verificationHash], "Verification already processed");
            
            // Mark as used and record the verification
            _tickets[tokenId].used = true;
            _offlineVerifiedTickets[verificationHash] = true;
            
            emit OfflineVerificationSynced(tokenId, verificationHash, msg.sender);
            emit TicketUsed(tokenId, msg.sender);
        }
    }
    
    /**
     * @dev Check if a ticket has been used
     * @param tokenId The ID of the ticket
     * @return Whether the ticket has been used
     */
    function isTicketUsed(uint256 tokenId) external view returns (bool) {
        require(exists(tokenId), "Ticket does not exist");
        return _tickets[tokenId].used;
    }
    
    /**
     * @dev Get information about a ticket
     * @param tokenId The ID of the ticket
     * @return Ticket information
     */
    function getTicketInfo(uint256 tokenId) external view returns (TicketInfo memory) {
        require(exists(tokenId), "Ticket does not exist");
        return _tickets[tokenId];
    }
    
    /**
     * @dev Get all tickets for an event
     * @param eventId The event ID to query
     * @return Array of ticket IDs for the event
     */
    function getEventTickets(uint256 eventId) external view returns (uint256[] memory) {
        // 获取所有票的数量
        uint256 totalTickets = _nextTokenId - 1;
        
        // 首先计算此事件的票数
        uint256 eventTicketCount = 0;
        for (uint256 i = 1; i <= totalTickets; i++) {
            if (exists(i) && _tickets[i].eventId == eventId) {
                eventTicketCount++;
            }
        }
        
        // 创建结果数组
        uint256[] memory result = new uint256[](eventTicketCount);
        uint256 resultIndex = 0;
        
        // 填充结果数组
        for (uint256 i = 1; i <= totalTickets; i++) {
            if (exists(i) && _tickets[i].eventId == eventId) {
                result[resultIndex] = i;
                resultIndex++;
            }
        }
        
        return result;
    }
    
    /**
     * @dev Generate QR code data for ticket verification
     * @param tokenId The ID of the ticket
     * @return QR code data as bytes
     */
    function generateTicketQRData(uint256 tokenId) public view returns (bytes memory) {
        require(exists(tokenId), "Ticket does not exist");
        
        address owner = ownerOf(tokenId);
        TicketInfo memory ticket = _tickets[tokenId];
        uint256 timestamp = block.timestamp;
        
        // Include verification data for both online and offline verification
        bytes32 checksum = keccak256(abi.encodePacked(
            tokenId,
            owner,
            ticket.eventId,
            ticket.ticketIndex,
            address(this),
            worldChainContractAddress,
            celoChainId,
            timestamp
        ));
        
        return abi.encode(
            tokenId,
            ticket.eventId,
            ticket.ticketIndex,
            celoChainId,
            address(this),
            worldChainContractAddress,
            owner,
            timestamp,
            checksum
        );
    }
    
    /**
     * @dev Generate an offline verification code for a ticket
     * This code can be used to verify a ticket without internet access
     * @param tokenId The ID of the ticket
     * @return Offline verification code
     */
    function generateOfflineVerificationCode(uint256 tokenId) public view 
        onlyRole(TICKET_VERIFIER_ROLE) returns (bytes32) {
        require(exists(tokenId), "Ticket does not exist");
        require(!_tickets[tokenId].used, "Ticket already used");
        
        address owner = ownerOf(tokenId);
        TicketInfo memory ticket = _tickets[tokenId];
        
        // Create a unique verification code using the secret only known to verifiers
        return keccak256(abi.encodePacked(
            tokenId,
            owner,
            ticket.eventId,
            ticket.ticketIndex,
            address(this),
            _verificationSecret
        ));
    }
    
    /**
     * @dev Verify an offline verification code
     * For local use in the verifier app - not called on-chain
     * @param tokenId The ID of the ticket
     * @param owner The owner of the ticket
     * @param eventId The event ID
     * @param ticketIndex The ticket index
     * @param contractAddress The address of this contract
     * @param verificationCode The offline verification code to check
     * @param secret The verification secret (should be securely stored in the verifier app)
     * @return Whether the verification code is valid
     */
    function verifyOfflineCode(
        uint256 tokenId,
        address owner,
        uint256 eventId,
        uint256 ticketIndex,
        address contractAddress,
        bytes32 verificationCode,
        bytes32 secret
    ) external pure returns (bool) {
        bytes32 expectedCode = keccak256(abi.encodePacked(
            tokenId,
            owner,
            eventId,
            ticketIndex,
            contractAddress,
            secret
        ));
        
        return verificationCode == expectedCode;
    }
    
    /**
     * @dev Returns the tokenURI for a given token ID
     * @param tokenId The ID of the token
     * @return The token's URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(exists(tokenId), "URI query for nonexistent token");
        return _tickets[tokenId].ticketURI;
    }
    
    /**
     * @dev See {IERC165-supportsInterface}
     */
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
} 