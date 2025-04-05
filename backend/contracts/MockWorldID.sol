// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "./interfaces/IWorldID.sol";

/**
 * @title MockWorldID
 * @dev A mock implementation of World ID for testing
 */
contract MockWorldID is IWorldID {
    mapping(uint256 => bool) public nullifierHashes;
    
    /**
     * @dev Verify a zero-knowledge proof (mock implementation)
     */
    function verifyProof(
        uint256 root,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view override {
        // In a mock implementation, we just check if the nullifier has been used
        // but don't modify state (since this is a view function)
        require(!nullifierHashes[nullifierHash], "Nullifier already used");
        
        // In a real implementation, this would verify the proof
        // We just return without doing any verification
    }
    
    /**
     * @dev Helper function to simulate marking a nullifier as used
     * @param nullifierHash The nullifier to mark as used
     */
    function useNullifier(uint256 nullifierHash) external {
        require(!nullifierHashes[nullifierHash], "Nullifier already used");
        nullifierHashes[nullifierHash] = true;
    }
}