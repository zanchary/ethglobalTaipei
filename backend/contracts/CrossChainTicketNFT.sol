// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title CrossChainTicketNFT
 * @dev 用于在目标链上代表原始链上门票的NFT合约
 */
contract CrossChainTicketNFT is ERC721URIStorage, AccessControl {
    using Strings for uint256;
    
    // 定义角色
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");
    
    // 跨链票据信息
    struct CrossChainTicketInfo {
        uint256 originChainId;      // 原始链ID
        address originContract;      // 原始合约地址
        uint256 originTokenId;       // 原始链上的令牌ID
        uint256 eventId;            // 活动ID
        uint256 seatNumber;         // 座位号码
        bool isUsed;                // 是否已使用
        address originalPurchaser;   // 原始购买者
        string customAttributes;    // 自定义属性
    }
    
    // 防止重复铸造的映射
    mapping(bytes32 => bool) public mintedTokens;
    
    // 票据信息映射
    mapping(uint256 => CrossChainTicketInfo) private _ticketInfo;
    
    // 跨链桥地址
    address public nftBridge;
    
    // 事件
    event CrossChainTicketMinted(
        uint256 indexed tokenId,
        uint256 indexed originChainId,
        address indexed originContract,
        uint256 originTokenId
    );
    
    event TicketUsed(uint256 indexed tokenId);
    event BridgeUpdated(address indexed oldBridge, address indexed newBridge);
    
    /**
     * @dev 构造函数
     * @param name NFT集合名称
     * @param symbol NFT集合符号
     * @param bridge 跨链桥地址
     */
    constructor(
        string memory name,
        string memory symbol,
        address bridge
    ) ERC721(name, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(URI_SETTER_ROLE, msg.sender);
        _grantRole(BRIDGE_ROLE, bridge);
        
        nftBridge = bridge;
    }
    
    /**
     * @dev 检查令牌是否存在
     * @param tokenId 令牌ID
     * @return 令牌是否存在
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
    
    /**
     * @dev 更新跨链桥地址
     * @param newBridge 新的跨链桥地址
     */
    function updateBridge(address newBridge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newBridge != address(0), "Invalid bridge address");
        
        address oldBridge = nftBridge;
        
        // 撤销旧桥的角色并授予新桥
        _revokeRole(BRIDGE_ROLE, oldBridge);
        _grantRole(BRIDGE_ROLE, newBridge);
        
        nftBridge = newBridge;
        
        emit BridgeUpdated(oldBridge, newBridge);
    }
    
    /**
     * @dev 铸造跨链门票
     * @param to 接收者地址
     * @param originChainId 原始链ID
     * @param originContract 原始合约地址
     * @param originTokenId 原始令牌ID
     * @param eventId 活动ID
     * @param seatNumber 座位号码
     * @param originalPurchaser 原始购买者
     * @param customAttributes 自定义属性
     * @param tokenURI 令牌URI
     * @return 新铸造的令牌ID
     */
    function mintCrossChainTicket(
        address to,
        uint256 originChainId,
        address originContract,
        uint256 originTokenId,
        uint256 eventId,
        uint256 seatNumber,
        address originalPurchaser,
        string calldata customAttributes,
        string calldata tokenURI
    ) external onlyRole(BRIDGE_ROLE) returns (uint256) {
        // 创建唯一标识符防止重复铸造
        bytes32 uniqueId = keccak256(abi.encodePacked(
            originChainId,
            originContract,
            originTokenId
        ));
        
        // 防止重复铸造
        require(!mintedTokens[uniqueId], "Token already bridged");
        
        // 生成令牌ID
        uint256 tokenId = uint256(keccak256(abi.encodePacked(
            originChainId,
            originContract,
            originTokenId,
            block.timestamp
        )));
        
        // 铸造新NFT
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        
        // 记录跨链信息
        _ticketInfo[tokenId] = CrossChainTicketInfo({
            originChainId: originChainId,
            originContract: originContract,
            originTokenId: originTokenId,
            eventId: eventId,
            seatNumber: seatNumber,
            isUsed: false,
            originalPurchaser: originalPurchaser,
            customAttributes: customAttributes
        });
        
        // 标记为已铸造
        mintedTokens[uniqueId] = true;
        
        emit CrossChainTicketMinted(tokenId, originChainId, originContract, originTokenId);
        
        return tokenId;
    }
    
    /**
     * @dev 标记票据为已使用
     * @param tokenId 票据令牌ID
     */
    function useTicket(uint256 tokenId) external onlyRole(MINTER_ROLE) {
        require(_exists(tokenId), "Ticket does not exist");
        require(!_ticketInfo[tokenId].isUsed, "Ticket already used");
        
        _ticketInfo[tokenId].isUsed = true;
        
        emit TicketUsed(tokenId);
    }
    
    /**
     * @dev 获取票据信息
     * @param tokenId 票据令牌ID
     * @return 跨链票据信息
     */
    function getTicketInfo(uint256 tokenId) external view returns (CrossChainTicketInfo memory) {
        require(_exists(tokenId), "Ticket does not exist");
        return _ticketInfo[tokenId];
    }
    
    /**
     * @dev 检查票据是否已使用
     * @param tokenId 票据令牌ID
     * @return 是否已使用
     */
    function isTicketUsed(uint256 tokenId) external view returns (bool) {
        require(_exists(tokenId), "Ticket does not exist");
        return _ticketInfo[tokenId].isUsed;
    }
    
    /**
     * @dev 获取原始购买者
     * @param tokenId 票据令牌ID
     * @return 原始购买者地址
     */
    function getOriginalPurchaser(uint256 tokenId) external view returns (address) {
        require(_exists(tokenId), "Ticket does not exist");
        return _ticketInfo[tokenId].originalPurchaser;
    }
    
    /**
     * @dev 更新令牌URI
     * @param tokenId 令牌ID
     * @param newTokenURI 新的令牌URI
     */
    function setTokenURI(uint256 tokenId, string calldata newTokenURI) 
        external onlyRole(URI_SETTER_ROLE) 
    {
        require(_exists(tokenId), "URI set of nonexistent token");
        _setTokenURI(tokenId, newTokenURI);
    }
    
    /**
     * @dev 支持接口检查
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