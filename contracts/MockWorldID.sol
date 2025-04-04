// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/**
 * @title MockWorldID
 * @dev A mock implementation of the WorldID interface for testing purposes
 */
contract MockWorldID {
  /**
   * @dev Mock implementation of the verifyProof function that always succeeds
   */
  function verifyProof(
    uint256 root,
    uint256 signalHash,
    uint256 nullifierHash,
    uint256 externalNullifierHash,
    uint256[8] calldata proof
  ) external view {
    // This is a mock implementation that doesn't actually verify anything
    // It simply doesn't revert, simulating a successful verification
  }
}