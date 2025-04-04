const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTicketingSystem } = require("./test-helpers");

describe("WorldIDVerifier", function() {
  let system;
  
  beforeEach(async function() {
    // Deploy the system
    system = await deployTicketingSystem();
  });
  
  describe("Root Management", function() {
    it("should add and validate roots for groups", async function() {
      // Add a new root for a group
      const groupId = 2; // Different from the one added in setup
      const root = ethers.utils.hexZeroPad("0xabc", 32);
      
      await system.worldIDVerifier.connect(system.owner).addRoot(root, groupId);
      
      // Check if the root is valid for the group
      const isValid = await system.worldIDVerifier.isRootValid(root, groupId);
      expect(isValid).to.be.true;
    });
    
    it("should reject adding roots by unauthorized accounts", async function() {
      const groupId = 2;
      const root = ethers.utils.hexZeroPad("0xabc", 32);
      
      await expect(
        system.worldIDVerifier.connect(system.buyer1).addRoot(root, groupId)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
  
  describe("Nullifier Hash Management", function() {
    it("should mark nullifier hashes as used", async function() {
      const nullifierHash = ethers.utils.hexZeroPad("0xdef", 32);
      
      // Consume the nullifier hash
      await system.worldIDVerifier.connect(system.owner).consumeNullifierHash(nullifierHash);
      
      // Check if the nullifier hash is marked as used
      const isUsed = await system.worldIDVerifier.isNullifierHashUsed(nullifierHash);
      expect(isUsed).to.be.true;
    });
    
    it("should reject consuming the same nullifier hash twice", async function() {
      const nullifierHash = ethers.utils.hexZeroPad("0xdef", 32);
      
      // Consume the nullifier hash once
      await system.worldIDVerifier.connect(system.owner).consumeNullifierHash(nullifierHash);
      
      // Try to consume it again
      await expect(
        system.worldIDVerifier.connect(system.owner).consumeNullifierHash(nullifierHash)
      ).to.be.revertedWith("Nullifier hash already used");
    });
  });
  
  describe("Proof Verification", function() {
    it("should verify proofs with valid parameters", async function() {
      // Get the existing root from the setup
      const groupId = 1;
      const root = ethers.utils.hexZeroPad("0x123", 32);
      
      // Create a new nullifier hash
      const nullifierHash = ethers.utils.hexZeroPad("0xabc123", 32);
      
      // Create a signal hash from a test address
      const testAddress = "0x1234567890123456789012345678901234567890";
      const signalHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address"], [testAddress]));
      
      // Mock proof (8 values for ZK proof)
      const proof = Array(8).fill(ethers.utils.hexZeroPad("0x789", 32));
      
      // Verify the proof
      const isValid = await system.worldIDVerifier.verifyProof(
        root,
        groupId,
        signalHash,
        nullifierHash,
        proof
      );
      
      // Our mock implementation always returns true
      expect(isValid).to.be.true;
    });
    
    it("should reject proofs with invalid roots", async function() {
      // Use a root that wasn't added
      const invalidRoot = ethers.utils.hexZeroPad("0xbeef", 32);
      const groupId = 1;
      
      // Create a signal hash and nullifier hash
      const testAddress = "0x1234567890123456789012345678901234567890";
      const signalHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address"], [testAddress]));
      const nullifierHash = ethers.utils.hexZeroPad("0xabc456", 32);
      
      // Mock proof
      const proof = Array(8).fill(ethers.utils.hexZeroPad("0x789", 32));
      
      // Verify the proof - should revert because the root is invalid
      await expect(
        system.worldIDVerifier.verifyProof(
          invalidRoot,
          groupId,
          signalHash,
          nullifierHash,
          proof
        )
      ).to.be.revertedWith("Invalid root for group");
    });
  });
});