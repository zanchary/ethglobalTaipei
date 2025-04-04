// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title ByteHasher
 * @dev Helper utility for hashing bytes to the required format for World ID verification
 * This library is derived from Worldcoin's examples
 */
library ByteHasher {
    /**
     * @dev Convert bytes to a field element for World ID proof verification
     * @param value The bytes to convert
     * @return The bytes converted to a field element
     */
    function hashToField(bytes memory value) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(value))) >> 8;
    }
}