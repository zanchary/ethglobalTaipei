// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NFTBridgeGateway
 * @dev 允许NFT在不同区块链之间迁移的合约
 */
contract NFTBridgeGateway is AccessControl, IERC721Receiver, ReentrancyGuard {
    using ECDSA for bytes32;
    
    // 角色定义
    bytes32 public constant BRIDGE_OPERATOR_ROLE = keccak256("BRIDGE_OPERATOR_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    
    // 跨链NFT信息
    struct BridgeInfo {
        address originNftContract;    // 原始NFT合约地址
        uint256 originTokenId;        // 原始NFT令牌ID
        uint256 originChainId;        // 原始链ID
        address owner;                // 当前所有者
        bool isLocked;                // 是否被锁定
        uint256 timestamp;            // 操作时间戳
    }
    
    // 标记已处理的请求，防止重放攻击
    mapping(bytes32 => bool) public processedRequests;
    
    // 当前链支持的其他链映射
    mapping(uint256 => bool) public supportedChains;
    
    // 锁定的NFT信息 (本链NFT => 锁定信息)
    mapping(address => mapping(uint256 => BridgeInfo)) public lockedNFTs;
    
    // 已迁移到本链的外部NFT映射
    mapping(uint256 => mapping(address => mapping(uint256 => address))) 
        public bridgedNFTs; // chainId => originalContract => originalTokenId => localContract
    
    // 从其他链迁移过来的NFT追踪 (本地NFT合约 => 本地令牌ID => 跨链信息)
    mapping(address => mapping(uint256 => BridgeInfo)) public bridgedNFTsInfo;
    
    // 事件
    event TokenLocked(
        address indexed nftContract,
        uint256 indexed tokenId,
        address indexed owner,
        uint256 targetChainId,
        bytes32 bridgeRequestId
    );
    
    event TokenUnlocked(
        address indexed nftContract,
        uint256 indexed tokenId,
        address indexed owner,
        uint256 sourceChainId
    );
    
    event TokenBridged(
        address indexed localContract,
        uint256 indexed localTokenId,
        uint256 indexed originChainId,
        address originContract,
        uint256 originTokenId,
        address owner
    );
    
    event BridgeRequestSent(
        bytes32 indexed requestId,
        address indexed sender,
        uint256 targetChainId
    );
    
    event ChainSupported(uint256 indexed chainId, bool isSupported);
    
    /**
     * @dev 构造函数
     */
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BRIDGE_OPERATOR_ROLE, msg.sender);
        _grantRole(VALIDATOR_ROLE, msg.sender);
        
        // 默认支持本链
        supportedChains[block.chainid] = true;
        emit ChainSupported(block.chainid, true);
    }
    
    /**
     * @dev 添加或移除支持的链
     * @param chainId 目标链ID
     * @param isSupported 是否支持
     */
    function setSupportedChain(uint256 chainId, bool isSupported) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        supportedChains[chainId] = isSupported;
        emit ChainSupported(chainId, isSupported);
    }
    
    /**
     * @dev 锁定NFT并发起跨链迁移
     * @param nftContract NFT合约地址
     * @param tokenId 令牌ID
     * @param targetChainId 目标链ID
     * @return bridgeRequestId 桥接请求ID
     */
    function lockAndBridge(
        address nftContract,
        uint256 tokenId,
        uint256 targetChainId
    ) external nonReentrant returns (bytes32) {
        require(supportedChains[targetChainId], "Target chain not supported");
        require(targetChainId != block.chainid, "Cannot bridge to same chain");
        
        // 校验NFT拥有者
        require(
            IERC721(nftContract).ownerOf(tokenId) == msg.sender,
            "Not the owner of the NFT"
        );
        
        // 生成桥接请求ID
        bytes32 bridgeRequestId = keccak256(abi.encodePacked(
            block.chainid,
            nftContract,
            tokenId,
            msg.sender,
            targetChainId,
            block.timestamp
        ));
        
        // 确保请求未处理过
        require(!processedRequests[bridgeRequestId], "Request already processed");
        
        // 标记请求为已处理
        processedRequests[bridgeRequestId] = true;
        
        // 将NFT转移到本合约(锁定)
        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);
        
        // 记录锁定信息
        lockedNFTs[nftContract][tokenId] = BridgeInfo({
            originNftContract: nftContract,
            originTokenId: tokenId,
            originChainId: block.chainid,
            owner: msg.sender,
            isLocked: true,
            timestamp: block.timestamp
        });
        
        // 触发事件通知链下监听服务
        emit TokenLocked(nftContract, tokenId, msg.sender, targetChainId, bridgeRequestId);
        emit BridgeRequestSent(bridgeRequestId, msg.sender, targetChainId);
        
        return bridgeRequestId;
    }
    
    /**
     * @dev 解锁NFT (当从其他链迁回时)
     * @param nftContract NFT合约地址
     * @param tokenId 令牌ID
     * @param to 接收地址
     * @param sourceChainId 源链ID
     * @param requestId 桥接请求ID
     * @param signature 验证者签名
     */
    function unlockToken(
        address nftContract,
        uint256 tokenId,
        address to,
        uint256 sourceChainId,
        bytes32 requestId,
        bytes calldata signature
    ) external nonReentrant onlyRole(BRIDGE_OPERATOR_ROLE) {
        // 确保请求未处理过
        require(!processedRequests[requestId], "Request already processed");
        
        // 验证NFT是否已锁定
        BridgeInfo storage bridgeInfo = lockedNFTs[nftContract][tokenId];
        require(bridgeInfo.isLocked, "Token not locked");
        
        // 验证签名
        bytes32 message = keccak256(abi.encodePacked(
            requestId,
            nftContract,
            tokenId,
            to,
            sourceChainId,
            block.chainid
        ));
        
        require(_verifySignature(message, signature), "Invalid signature");
        
        // 标记请求为已处理
        processedRequests[requestId] = true;
        
        // 移除锁定标记
        bridgeInfo.isLocked = false;
        
        // 将NFT转回接收者
        IERC721(nftContract).safeTransferFrom(address(this), to, tokenId);
        
        emit TokenUnlocked(nftContract, tokenId, to, sourceChainId);
    }
    
    /**
     * @dev 在目标链上完成桥接过程
     * @param originChainId 源链ID
     * @param originContract 源链上的NFT合约地址
     * @param originTokenId 源链上的令牌ID
     * @param owner 所有者地址
     * @param tokenURI 令牌URI
     * @param localContract 本地(目标链)上的NFT合约地址
     * @param requestId 桥接请求ID
     * @param signature 验证者签名
     * @return 本地生成的令牌ID
     */
    function completeBridge(
        uint256 originChainId,
        address originContract,
        uint256 originTokenId,
        address owner,
        string calldata tokenURI,
        address localContract,
        bytes32 requestId,
        bytes calldata signature
    ) external nonReentrant onlyRole(BRIDGE_OPERATOR_ROLE) returns (uint256) {
        require(supportedChains[originChainId], "Origin chain not supported");
        require(originChainId != block.chainid, "Cannot bridge from same chain");
        require(!processedRequests[requestId], "Request already processed");
        
        // 验证签名
        bytes32 message = keccak256(abi.encodePacked(
            requestId,
            originChainId,
            originContract,
            originTokenId,
            owner,
            localContract,
            block.chainid
        ));
        
        require(_verifySignature(message, signature), "Invalid signature");
        
        // 标记请求为已处理
        processedRequests[requestId] = true;
        
        // 生成唯一令牌ID (使用原始链信息和原始令牌ID)
        uint256 localTokenId = uint256(keccak256(abi.encodePacked(
            originChainId,
            originContract,
            originTokenId,
            block.timestamp
        )));
        
        // 记录桥接信息
        bridgedNFTs[originChainId][originContract][originTokenId] = localContract;
        
        bridgedNFTsInfo[localContract][localTokenId] = BridgeInfo({
            originNftContract: originContract,
            originTokenId: originTokenId,
            originChainId: originChainId,
            owner: owner,
            isLocked: false,
            timestamp: block.timestamp
        });
        
        // 这里需要外部合约配合，将铸造权限授予本合约
        // 调用本地NFT合约铸造新令牌
        // 这里仅触发事件，实际铸造过程由链下服务或DApp完成
        emit TokenBridged(
            localContract,
            localTokenId,
            originChainId,
            originContract,
            originTokenId,
            owner
        );
        
        return localTokenId;
    }
    
    /**
     * @dev 验证签名是否来自授权验证者
     * @param message 消息哈希
     * @param signature 签名
     * @return 签名是否有效
     */
    function _verifySignature(bytes32 message, bytes calldata signature) 
        internal view returns (bool) 
    {
        // 自定义实现消息哈希方法
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", message)
        );
        
        try this.recoverSigner(ethSignedMessageHash, signature) returns (address signer) {
            // 检查签名者是否为验证者
            return hasRole(VALIDATOR_ROLE, signer);
        } catch {
            return false;
        }
    }
    
    /**
     * @dev 尝试恢复签名者
     * @param ethSignedMessageHash 以太坊签名消息哈希
     * @param signature 签名
     * @return 签名者地址
     */
    function recoverSigner(bytes32 ethSignedMessageHash, bytes calldata signature) 
        external view returns (address) 
    {
        return ECDSA.recover(ethSignedMessageHash, signature);
    }
    
    /**
     * @dev 实现IERC721Receiver接口
     */
    function onERC721Received(
        address, // operator
        address from, 
        uint256 tokenId,
        bytes calldata // data
    ) external override returns (bytes4) {
        // 这里可以添加额外的安全检查
        return this.onERC721Received.selector;
    }
    
    /**
     * @dev 获取跨链来源的NFT信息
     * @param nftContract 本地NFT合约地址
     * @param tokenId 本地令牌ID
     * @return 跨链信息
     */
    function getBridgedNFTInfo(address nftContract, uint256 tokenId) 
        external view returns (BridgeInfo memory) 
    {
        return bridgedNFTsInfo[nftContract][tokenId];
    }
    
    /**
     * @dev 检查NFT是否是通过跨链桥接到本链的
     * @param nftContract 本地NFT合约地址
     * @param tokenId 本地令牌ID
     * @return 是否是桥接的NFT
     */
    function isBridgedNFT(address nftContract, uint256 tokenId) 
        external view returns (bool) 
    {
        return bridgedNFTsInfo[nftContract][tokenId].originChainId != 0;
    }
} 