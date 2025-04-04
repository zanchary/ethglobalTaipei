// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces.sol";

/**
 * @title WorldIDVerifier
 * @dev Contract for verifying World ID proofs
 */
contract WorldIDVerifier is IWorldIDVerifier, Ownable {
    // State variables
    mapping(uint256 => bool) private nullifierHashes;
    mapping(uint256 => mapping(uint256 => bool)) private groupRoots;
    
    // Events
    event RootAdded(uint256 root, uint256 groupId);
    event NullifierHashUsed(uint256 nullifierHash);
    
    // Constructor
    constructor() Ownable(msg.sender) {
    }
    
    /**
     * @dev Adds a new root for a group
     * @param root Merkle root
     * @param groupId Group ID
     */
    function addRoot(uint256 root, uint256 groupId) external onlyOwner {
        groupRoots[groupId][root] = true;
        emit RootAdded(root, groupId);
    }
    
    /**
     * @dev Verifies a World ID proof
     * @param root Merkle root
     * @param groupId Group ID
     * @param signalHash Hash of the signal
     * @param nullifierHash Nullifier hash
     * @param proof ZK proof
     */
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external view override returns (bool) {
        // Check if root is valid for this group
        require(groupRoots[groupId][root], "Invalid root for group");
        
        // Check if nullifier hash has not been used
        require(!nullifierHashes[nullifierHash], "Nullifier hash already used");
        
        // For simplicity, we assume the proof is always valid in this demo
        // In a real implementation, this would verify the ZK proof cryptographically
        
        // Note: This is a simplified verification that mimics the interface
        // but doesn't perform actual cryptographic verification
        
        return true;
    }
    
    /**
     * @dev Consumes a nullifier hash (marks it as used)
     * @param nullifierHash Nullifier hash to consume
     */
    function consumeNullifierHash(uint256 nullifierHash) external onlyOwner {
        require(!nullifierHashes[nullifierHash], "Nullifier hash already used");
        nullifierHashes[nullifierHash] = true;
        emit NullifierHashUsed(nullifierHash);
    }
    
    /**
     * @dev Checks if a nullifier hash has been used
     * @param nullifierHash Nullifier hash to check
     */
    function isNullifierHashUsed(uint256 nullifierHash) external view returns (bool) {
        return nullifierHashes[nullifierHash];
    }
    
    /**
     * @dev Checks if a root is valid for a group
     * @param root Merkle root to check
     * @param groupId Group ID to check
     */
    function isRootValid(uint256 root, uint256 groupId) external view returns (bool) {
        return groupRoots[groupId][root];
    }
}