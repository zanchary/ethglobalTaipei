// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title DynamicTicketNFT
 * @dev NFT contract for event tickets with dynamic metadata that changes based on ticket state
 */
contract DynamicTicketNFT is ERC721URIStorage, AccessControl {
    using Strings for uint256;
    
    // Define roles
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");
    bytes32 public constant TICKET_MANAGER_ROLE = keccak256("TICKET_MANAGER_ROLE");
    
    // 票据状态枚举
    enum TicketState { ACTIVE, CHECKED_IN, USED, EXPIRED }
    
    // 票据信息结构
    struct TicketInfo {
        uint256 eventId;
        uint256 seatNumber;
        uint256 purchaseTime;
        uint256 lastUpdated;
        TicketState state;
        address originalPurchaser;
        string customAttributes; // 存储JSON格式的自定义属性
    }
    
    // 基础URI，用于构建tokenURI
    string private _baseURIValue;
    
    // 元数据服务器地址，用于生成动态元数据
    string public metadataServer;
    
    // 票据信息映射
    mapping(uint256 => TicketInfo) private _ticketInfo;
    
    // 活动时间映射
    mapping(uint256 => uint256) public eventTimes;
    
    // 事件
    event TicketStateChanged(uint256 indexed tokenId, TicketState oldState, TicketState newState);
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed owner);
    event TicketCheckedIn(uint256 indexed tokenId, uint256 timestamp);
    event TicketUsed(uint256 indexed tokenId, uint256 timestamp);
    event TicketExpired(uint256 indexed tokenId, uint256 timestamp);
    
    /**
     * @dev 构造函数
     * @param name NFT集合名称
     * @param symbol NFT集合符号
     * @param metadataServerUrl 元数据服务器URL
     */
    constructor(
        string memory name,
        string memory symbol,
        string memory metadataServerUrl
    ) ERC721(name, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(URI_SETTER_ROLE, msg.sender);
        _grantRole(TICKET_MANAGER_ROLE, msg.sender);
        
        metadataServer = metadataServerUrl;
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
     * @dev 设置基础URI
     * @param baseURI_ 新的基础URI
     */
    function setBaseURI(string memory baseURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseURIValue = baseURI_;
    }
    
    /**
     * @dev 设置元数据服务器URL
     * @param serverUrl 新的元数据服务器URL
     */
    function setMetadataServer(string memory serverUrl) external onlyRole(DEFAULT_ADMIN_ROLE) {
        metadataServer = serverUrl;
    }
    
    /**
     * @dev 设置活动时间
     * @param eventId 活动ID
     * @param eventTime 活动时间（UNIX时间戳）
     */
    function setEventTime(uint256 eventId, uint256 eventTime) external onlyRole(TICKET_MANAGER_ROLE) {
        require(eventTime > block.timestamp, "Event time must be in the future");
        eventTimes[eventId] = eventTime;
    }
    
    /**
     * @dev 铸造新票据
     * @param to 接收者地址
     * @param eventId 活动ID
     * @param seatNumber 座位号码
     * @param customAttributes 自定义属性（JSON格式字符串）
     * @return 新铸造的票据令牌ID
     */
    function mintTicket(
        address to,
        uint256 eventId,
        uint256 seatNumber,
        string memory customAttributes
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        require(eventTimes[eventId] > 0, "Event time not set");
        
        uint256 tokenId = uint256(keccak256(abi.encodePacked(to, eventId, seatNumber, block.timestamp)));
        
        _safeMint(to, tokenId);
        
        _ticketInfo[tokenId] = TicketInfo({
            eventId: eventId,
            seatNumber: seatNumber,
            purchaseTime: block.timestamp,
            lastUpdated: block.timestamp,
            state: TicketState.ACTIVE,
            originalPurchaser: to,
            customAttributes: customAttributes
        });
        
        emit TicketMinted(tokenId, eventId, to);
        
        return tokenId;
    }
    
    /**
     * @dev 更新票据状态
     * @param tokenId 票据ID
     * @param newState 新状态
     */
    function updateTicketState(uint256 tokenId, TicketState newState) 
        external 
        onlyRole(TICKET_MANAGER_ROLE) 
    {
        require(_exists(tokenId), "Ticket does not exist");
        
        TicketInfo storage ticket = _ticketInfo[tokenId];
        TicketState oldState = ticket.state;
        
        // 防止无效的状态转换
        if (oldState == TicketState.EXPIRED || oldState == TicketState.USED) {
            require(
                newState == TicketState.ACTIVE, 
                "Cannot change state from EXPIRED or USED except to ACTIVE"
            );
        }
        
        ticket.state = newState;
        ticket.lastUpdated = block.timestamp;
        
        // 根据不同状态触发不同事件
        if (newState == TicketState.CHECKED_IN) {
            emit TicketCheckedIn(tokenId, block.timestamp);
        } else if (newState == TicketState.USED) {
            emit TicketUsed(tokenId, block.timestamp);
        } else if (newState == TicketState.EXPIRED) {
            emit TicketExpired(tokenId, block.timestamp);
        }
        
        emit TicketStateChanged(tokenId, oldState, newState);
    }
    
    /**
     * @dev 检查入场
     * @param tokenId 票据ID
     */
    function checkIn(uint256 tokenId) external onlyRole(TICKET_MANAGER_ROLE) {
        require(_exists(tokenId), "Ticket does not exist");
        TicketInfo storage ticket = _ticketInfo[tokenId];
        
        require(ticket.state == TicketState.ACTIVE, "Ticket not in active state");
        require(block.timestamp < eventTimes[ticket.eventId], "Event has already occurred");
        
        ticket.state = TicketState.CHECKED_IN;
        ticket.lastUpdated = block.timestamp;
        
        emit TicketCheckedIn(tokenId, block.timestamp);
        emit TicketStateChanged(tokenId, TicketState.ACTIVE, TicketState.CHECKED_IN);
    }
    
    /**
     * @dev 标记票据为已使用
     * @param tokenId 票据ID
     */
    function useTicket(uint256 tokenId) external onlyRole(TICKET_MANAGER_ROLE) {
        require(_exists(tokenId), "Ticket does not exist");
        TicketInfo storage ticket = _ticketInfo[tokenId];
        
        require(
            ticket.state == TicketState.ACTIVE || ticket.state == TicketState.CHECKED_IN, 
            "Ticket must be active or checked-in"
        );
        
        TicketState oldState = ticket.state;
        ticket.state = TicketState.USED;
        ticket.lastUpdated = block.timestamp;
        
        emit TicketUsed(tokenId, block.timestamp);
        emit TicketStateChanged(tokenId, oldState, TicketState.USED);
    }
    
    /**
     * @dev 更新票据的自定义属性
     * @param tokenId 票据ID
     * @param newAttributes 新的自定义属性（JSON格式字符串）
     */
    function updateTicketAttributes(uint256 tokenId, string memory newAttributes) 
        external 
        onlyRole(TICKET_MANAGER_ROLE) 
    {
        require(_exists(tokenId), "Ticket does not exist");
        _ticketInfo[tokenId].customAttributes = newAttributes;
        _ticketInfo[tokenId].lastUpdated = block.timestamp;
    }
    
    /**
     * @dev 获取票据信息
     * @param tokenId 票据ID
     * @return 票据信息
     */
    function getTicketInfo(uint256 tokenId) external view returns (TicketInfo memory) {
        require(_exists(tokenId), "Ticket does not exist");
        return _ticketInfo[tokenId];
    }
    
    /**
     * @dev 获取票据当前状态
     * @param tokenId 票据ID
     * @return 票据当前状态
     */
    function getTicketState(uint256 tokenId) public view returns (TicketState) {
        require(_exists(tokenId), "Ticket does not exist");
        
        TicketInfo memory info = _ticketInfo[tokenId];
        
        // 已标记为过期或已使用的票据保持该状态
        if (info.state == TicketState.EXPIRED || info.state == TicketState.USED) {
            return info.state;
        }
        
        // 检查活动是否已过期
        if (eventTimes[info.eventId] > 0 && block.timestamp > eventTimes[info.eventId]) {
            return TicketState.EXPIRED;
        }
        
        // 返回当前存储的状态
        return info.state;
    }
    
    /**
     * @dev 返回基础URI
     */
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseURIValue;
    }
    
    /**
     * @dev 覆盖tokenURI函数以实现动态元数据
     * @param tokenId 票据ID
     * @return 令牌的URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "URI query for nonexistent token");
        
        // 如果有设置元数据服务器，则使用动态元数据
        if (bytes(metadataServer).length > 0) {
            TicketState state = getTicketState(tokenId);
            return string(abi.encodePacked(
                metadataServer,
                "/api/metadata/",
                tokenId.toString(),
                "?state=",
                uint256(state).toString(),
                "&timestamp=",
                block.timestamp.toString()
            ));
        }
        
        // 否则使用标准的ERC721URIStorage逻辑
        return super.tokenURI(tokenId);
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