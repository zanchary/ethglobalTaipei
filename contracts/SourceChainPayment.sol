// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SourceChainPayment
 * @dev Contract to handle payments on source chains for cross-chain ticket purchases
 */
contract SourceChainPayment is Ownable, ReentrancyGuard {
    // Chain ID of this contract
    uint256 public chainId;
    
    // Relayer contract address
    address public relayer;
    
    // Mapping of token address to whether it's accepted
    mapping(address => bool) public acceptedTokens;
    
    // Fee percentage for cross-chain operations (basis points, 100 = 1%)
    uint256 public bridgeFeePercentage = 100; // 1% default
    
    // Events
    event PaymentReceived(
        address indexed payer,
        address indexed token,
        uint256 amount,
        uint256 targetEventId,
        bytes32 paymentId
    );
    
    event TokenAccepted(address indexed token);
    
    event RelayerUpdated(address indexed newRelayer);
    
    /**
     * @dev Constructor
     * @param _chainId Chain ID of this contract
     * @param _relayer Address of the relayer
     */
    constructor(uint256 _chainId, address _relayer) Ownable(msg.sender) {
        chainId = _chainId;
        relayer = _relayer;
        
        // Add native token (address(0)) as accepted
        acceptedTokens[address(0)] = true;
    }
    
    /**
     * @dev Updates the relayer address
     * @param _relayer New relayer address
     */
    function updateRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Invalid relayer address");
        relayer = _relayer;
        emit RelayerUpdated(_relayer);
    }
    
    /**
     * @dev Adds a token to the accepted tokens list
     * @param token Address of the token
     */
    function addAcceptedToken(address token) external onlyOwner {
        acceptedTokens[token] = true;
        emit TokenAccepted(token);
    }
    
    /**
     * @dev Removes a token from the accepted tokens list
     * @param token Address of the token
     */
    function removeAcceptedToken(address token) external onlyOwner {
        acceptedTokens[token] = false;
    }
    
    /**
     * @dev Sets the bridge fee percentage
     * @param newFeePercentage New fee percentage (basis points)
     */
    function setBridgeFeePercentage(uint256 newFeePercentage) external onlyOwner {
        require(newFeePercentage <= 1000, "Fee too high"); // Max 10%
        bridgeFeePercentage = newFeePercentage;
    }
    
    /**
     * @dev Pays for a ticket with native token
     * @param targetEventId Event ID on the target chain
     * @param targetChainId Chain ID of the target chain (usually World Chain)
     * @return paymentId Unique ID for this payment
     */
    function payWithNativeToken(uint256 targetEventId, uint256 targetChainId) 
        external 
        payable 
        nonReentrant 
        returns (bytes32) 
    {
        require(msg.value > 0, "Payment amount must be greater than zero");
        
        // Calculate bridge fee
        uint256 bridgeFee = (msg.value * bridgeFeePercentage) / 10000;
        uint256 paymentAmount = msg.value - bridgeFee;
        
        // Generate payment ID
        bytes32 paymentId = keccak256(abi.encodePacked(
            chainId,
            block.timestamp,
            msg.sender,
            paymentAmount,
            targetEventId
        ));
        
        // Send bridge fee to the relayer
        (bool success, ) = payable(relayer).call{value: bridgeFee}("");
        require(success, "Bridge fee transfer failed");
        
        // Emit event for the relayer to pick up
        emit PaymentReceived(
            msg.sender,
            address(0), // Native token
            paymentAmount,
            targetEventId,
            paymentId
        );
        
        return paymentId;
    }
    
    /**
     * @dev Pays for a ticket with an ERC20 token
     * @param token Address of the token
     * @param amount Amount to pay
     * @param targetEventId Event ID on the target chain
     * @param targetChainId Chain ID of the target chain (usually World Chain)
     * @return paymentId Unique ID for this payment
     */
    function payWithToken(
        address token,
        uint256 amount,
        uint256 targetEventId,
        uint256 targetChainId
    ) 
        external 
        nonReentrant 
        returns (bytes32) 
    {
        require(acceptedTokens[token], "Token not accepted");
        require(amount > 0, "Payment amount must be greater than zero");
        
        // Calculate bridge fee
        uint256 bridgeFee = (amount * bridgeFeePercentage) / 10000;
        uint256 paymentAmount = amount - bridgeFee;
        
        // Generate payment ID
        bytes32 paymentId = keccak256(abi.encodePacked(
            chainId,
            block.timestamp,
            msg.sender,
            paymentAmount,
            targetEventId,
            token
        ));
        
        // Transfer tokens from sender to this contract
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        
        // Transfer bridge fee to the relayer
        IERC20(token).transfer(relayer, bridgeFee);
        
        // Emit event for the relayer to pick up
        emit PaymentReceived(
            msg.sender,
            token,
            paymentAmount,
            targetEventId,
            paymentId
        );
        
        return paymentId;
    }
    
    /**
     * @dev Allows withdrawal of collected tokens by the owner
     * @param token Address of the token to withdraw (address(0) for native token)
     * @param amount Amount to withdraw
     */
    function withdrawFunds(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            // Withdraw native token
            require(address(this).balance >= amount, "Insufficient balance");
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            // Withdraw ERC20 token
            require(IERC20(token).balanceOf(address(this)) >= amount, "Insufficient token balance");
            IERC20(token).transfer(msg.sender, amount);
        }
    }
    
    /**
     * @dev Allows contract to receive native token
     */
    receive() external payable {}
} 