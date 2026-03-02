// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interface for verification templates to call
///         their paired RevocationRegistry during registration.
interface IRevocationRegistry {
    function register(bytes32 hash) external;
}
