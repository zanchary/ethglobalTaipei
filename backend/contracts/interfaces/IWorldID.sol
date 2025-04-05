// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IWorldID
 * @dev Interface for World ID verification
 */
interface IWorldID {
    /**
     * @dev Verify a World ID zero-knowledge proof
     * @param root The root of the Merkle tree
     * @param signalHash The hash of the signal
     * @param nullifierHash The nullifier hash for this proof
     * @param externalNullifierHash The hash of the external nullifier
     * @param proof The zero-knowledge proof
     */
    function verifyProof(
        uint256 root,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}