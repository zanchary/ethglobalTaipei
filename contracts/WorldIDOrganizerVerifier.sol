// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

// Define the IWorldID interface directly in the contract
interface IWorldID {
    /// @notice Verifies a ZK proof
    /// @param root The root of the Merkle tree
    /// @param groupId The group ID (app ID) used for verification
    /// @param signalHash The signal hash for this proof
    /// @param nullifierHash The nullifier hash for this proof
    /// @param actionId The action ID for this proof
    /// @param proof The zero-knowledge proof
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 actionId,
        uint256[8] calldata proof
    ) external view;
}

contract WorldIDOrganizerVerifier is Ownable {
    // The World ID instance that will be used for verifying proofs
    IWorldID internal worldId;
    
    // The World ID group ID (app ID) used for verification
    uint256 internal immutable groupId;
    
    // The World ID action ID used for verification
    uint256 internal immutable actionId;
    
    // Whether an organizer has been verified with World ID
    mapping(address => bool) public verifiedOrganizers;
    
    // Event emitted when an organizer is verified
    event OrganizerVerified(address indexed organizer);
    
    // Error when an organizer has already been verified
    error AlreadyVerified();
    
    /// @param _worldId The WorldID instance used for verification
    /// @param _groupId The WorldID group ID (app ID)
    /// @param _actionId The WorldID action ID
    constructor(
        IWorldID _worldId,
        uint256 _groupId,
        uint256 _actionId
    ) Ownable(msg.sender) {
        worldId = _worldId;
        groupId = _groupId;
        actionId = _actionId;
    }
    
    /// @notice Verify an organizer using World ID
    /// @param signal The signal to verify
    /// @param root The root of the Merkle tree
    /// @param nullifierHash The nullifier hash for this proof
    /// @param proof The zero-knowledge proof
    function verifyOrganizer(
        address signal,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) public {
        // Check if the organizer is already verified
        if (verifiedOrganizers[signal]) {
            revert AlreadyVerified();
        }
        
        // Verify the World ID proof using signal hash
        worldId.verifyProof(
            root,
            groupId,
            hashToField(abi.encodePacked(signal)),
            nullifierHash,
            actionId,
            proof
        );
        
        // Mark the organizer as verified
        verifiedOrganizers[signal] = true;
        
        // Emit the OrganizerVerified event
        emit OrganizerVerified(signal);
    }
    
    /// @notice Convert bytes to field element
    function hashToField(bytes memory data) internal pure returns (uint256) {
        return uint256(keccak256(data)) % 2**252 + 27;
    }
    
    /// @notice Check if an organizer is verified
    /// @param organizer The organizer's address
    /// @return Whether the organizer is verified
    function isVerifiedOrganizer(address organizer) public view returns (bool) {
        return verifiedOrganizers[organizer];
    }
    
    /// @notice Manual verification by owner (for testing or fallback)
    /// @param organizer The organizer's address
    function manualVerify(address organizer) public onlyOwner {
        verifiedOrganizers[organizer] = true;
        emit OrganizerVerified(organizer);
    }
}