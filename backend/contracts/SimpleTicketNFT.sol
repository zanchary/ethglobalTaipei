// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SimpleTicketNFT
 * @dev A simplified NFT contract for event tickets that avoids using Counters library
 */
contract SimpleTicketNFT is ERC721, AccessControl {
    // Roles for access control
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    
    // 简单的计数器，替代Counters库
    uint256 private _nextTokenId;
    
    // 票据信息
    struct TicketInfo {
        uint256 eventId;
        uint256 price;
        address purchaser;
        uint256 purchaseTime;
        string ticketURI;
        bool used;
    }
    
    // 存储票据信息的映射
    mapping(uint256 => TicketInfo) private _tickets;
    
    // 事件
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed owner);
    event TicketUsed(uint256 indexed tokenId, address indexed verifier);
    
    /**
     * @dev 构造函数
     */
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
        
        // 初始化token ID为1
        _nextTokenId = 1;
    }
    
    /**
     * @dev 检查token是否存在
     * @param tokenId 要检查的token ID
     * @return 该token是否存在
     */
    function exists(uint256 tokenId) public view returns (bool) {
        // 使用try/catch来处理当token不存在时ownerOf会抛出的错误
        try this.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * @dev 铸造新票据
     * @param to 票据接收者
     * @param eventId 事件ID
     * @param price 票价
     * @param ticketURI 票据URI
     * @return tokenId 新票据的ID
     */
    function mintTicket(
        address to,
        uint256 eventId,
        uint256 price,
        string memory ticketURI
    ) public onlyRole(MINTER_ROLE) returns (uint256) {
        uint256 tokenId = _nextTokenId;
        _nextTokenId++;
        
        _safeMint(to, tokenId);
        
        _tickets[tokenId] = TicketInfo({
            eventId: eventId,
            price: price,
            purchaser: to,
            purchaseTime: block.timestamp,
            ticketURI: ticketURI,
            used: false
        });
        
        emit TicketMinted(tokenId, eventId, to);
        
        return tokenId;
    }
    
    /**
     * @dev 使用票据
     * @param tokenId 票据ID
     */
    function useTicket(uint256 tokenId) external onlyRole(VERIFIER_ROLE) {
        require(exists(tokenId), "Ticket does not exist");
        require(!_tickets[tokenId].used, "Ticket already used");
        
        _tickets[tokenId].used = true;
        emit TicketUsed(tokenId, msg.sender);
    }
    
    /**
     * @dev 检查票据是否已使用
     * @param tokenId 票据ID
     */
    function isTicketUsed(uint256 tokenId) external view returns (bool) {
        require(exists(tokenId), "Ticket does not exist");
        return _tickets[tokenId].used;
    }
    
    /**
     * @dev 获取票据信息
     * @param tokenId 票据ID
     */
    function getTicketInfo(uint256 tokenId) external view returns (TicketInfo memory) {
        require(exists(tokenId), "Ticket does not exist");
        return _tickets[tokenId];
    }
    
    /**
     * @dev 返回票据URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(exists(tokenId), "URI query for nonexistent token");
        return _tickets[tokenId].ticketURI;
    }
    
    /**
     * @dev 实现supportsInterface
     */
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
} 