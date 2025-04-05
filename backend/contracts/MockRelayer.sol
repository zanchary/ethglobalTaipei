// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CrossChainBridge.sol";

/**
 * @title MockRelayer
 * @dev A mock contract to simulate cross-chain message relaying for testing
 * In a production environment, this would be replaced with an actual cross-chain
 * messaging protocol like Axelar, LayerZero, or Chainlink CCIP.
 */
contract MockRelayer is Ownable, ReentrancyGuard {
    // Target chain bridge contract
    CrossChainBridge public targetBridge;
    
    // Trusted source chains
    mapping(uint256 => bool) public trustedSourceChains;
    
    // Mapping from payment ID to whether it's been relayed
    mapping(bytes32 => bool) public relayedPayments;
    
    // Events
    event PaymentRelayed(
        bytes32 indexed paymentId,
        uint256 indexed sourceChainId,
        address indexed payer,
        uint256 amount,
        uint256 eventId
    );
    
    /**
     * @dev Constructor
     * @param _targetBridge Address of the target bridge on the destination chain
     */
    constructor(address payable _targetBridge) Ownable(msg.sender) {
        targetBridge = CrossChainBridge(_targetBridge);
    }
    
    /**
     * @dev Sets the target bridge address
     * @param _targetBridge New target bridge address
     */
    function setTargetBridge(address payable _targetBridge) external onlyOwner {
        require(_targetBridge != address(0), "Invalid bridge address");
        targetBridge = CrossChainBridge(_targetBridge);
    }
    
    /**
     * @dev Adds a trusted source chain
     * @param chainId ID of the source chain
     */
    function addTrustedSourceChain(uint256 chainId) external onlyOwner {
        trustedSourceChains[chainId] = true;
    }
    
    /**
     * @dev Removes a trusted source chain
     * @param chainId ID of the source chain
     */
    function removeTrustedSourceChain(uint256 chainId) external onlyOwner {
        trustedSourceChains[chainId] = false;
    }
    
    /**
     * @dev Manually triggers message relay (for testing)
     * This simulates the relayer receiving an event from a source chain
     * In a real implementation, this would be automated via off-chain monitoring
     * @param sourceChainId ID of the source chain
     * @param paymentTxHash Transaction hash on the source chain
     * @param payer Address of the payer
     * @param token Address of the token used for payment
     * @param amount Amount paid
     * @param eventId Event ID the payment is for
     */
    function relayPayment(
        uint256 sourceChainId,
        bytes32 paymentTxHash,
        address payer,
        address token,
        uint256 amount,
        uint256 eventId
    ) external nonReentrant {
        // In a real implementation, this would verify the payment happened
        // on the source chain via merkle proofs or trusted oracles
        
        // Check source chain is trusted
        require(trustedSourceChains[sourceChainId], "Untrusted source chain");
        
        // Generate a unique payment ID
        bytes32 paymentId = keccak256(abi.encodePacked(
            sourceChainId,
            paymentTxHash,
            payer,
            token,
            amount,
            eventId
        ));
        
        // Ensure not already relayed
        require(!relayedPayments[paymentId], "Payment already relayed");
        
        // Mark as relayed
        relayedPayments[paymentId] = true;
        
        // Record payment on the target chain
        targetBridge.recordCrossChainPayment(
            sourceChainId,
            paymentTxHash,
            payer,
            token,
            amount,
            eventId
        );
        
        emit PaymentRelayed(
            paymentId,
            sourceChainId,
            payer,
            amount,
            eventId
        );
    }
    
    /**
     * @dev Withdraw collected fees (native token)
     * @param amount Amount to withdraw
     */
    function withdrawFees(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
    }
    
    /**
     * @dev Contract can receive ETH (relayer fees)
     */
    receive() external payable {}
} 