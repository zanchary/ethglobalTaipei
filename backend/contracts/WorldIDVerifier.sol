// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "./interfaces/IWorldID.sol";
import "./helpers/ByteHasher.sol";

/**
 * @title WorldIDVerifier
 * @dev Contract to handle World ID verification for the ticketing platform
 */
contract WorldIDVerifier {
    using ByteHasher for bytes;

    // The World ID instance that will be used for verification
    IWorldID internal immutable worldId;
    
    // A unique identifier for the application
    string public appId;
    
    // A unique identifier for each action in the application
    mapping(string => bool) public registeredActions;
    
    // A mapping of nullifier hashes to prevent double-signaling
    mapping(uint256 => bool) internal nullifierHashes;
    
    // Mapping from user address to verified status
    mapping(address => bool) public verified;
    
    // Events
    event VerificationSuccess(address indexed user, string actionId);
    event ActionRegistered(string actionId);
    
    /**
     * @dev Constructor for the World ID verifier contract
     * @param _worldId The World ID instance that will verify the proofs
     * @param _appId The application's ID registered with World ID
     */
    constructor(IWorldID _worldId, string memory _appId) {
        worldId = _worldId;
        appId = _appId;
    }
    
    /**
     * @dev Register a new action ID for verification
     * @param actionId The action identifier
     */
    function registerAction(string memory actionId) external {
        registeredActions[actionId] = true;
        emit ActionRegistered(actionId);
    }
    
    /**
     * @dev Verify a World ID proof
     * @param signal Data signed by the user as part of the proof
     * @param root The root of the Merkle tree
     * @param nullifierHash The nullifier hash for this proof
     * @param actionId The action identifier
     * @param proof The zero-knowledge proof
     */
    function verifyAndRegister(
        address signal,
        uint256 root,
        uint256 nullifierHash,
        string memory actionId,
        uint256[8] calldata proof
    ) external {
        // Ensure action is registered
        require(registeredActions[actionId], "Action ID not registered");
        
        // Prevent double-signaling
        require(!nullifierHashes[nullifierHash], "Nullifier already used");
        
        // Verify the provided proof
        worldId.verifyProof(
            root,
            abi.encodePacked(signal).hashToField(),
            nullifierHash,
            abi.encodePacked(appId, actionId).hashToField(),
            proof
        );
        
        // Mark the nullifier as used
        nullifierHashes[nullifierHash] = true;
        
        // Mark the user as verified
        verified[signal] = true;
        
        emit VerificationSuccess(signal, actionId);
    }
    
    /**
     * @dev Check if a user is verified with World ID
     * @param user The address to check
     * @return Whether the user is verified
     */
    function isVerified(address user) external view returns (bool) {
        return verified[user];
    }
}