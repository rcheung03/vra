// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RevocationRegistry
/// @notice Tightly coupled revocation companion for verification registry templates.
///         Deployed BEFORE its paired verification registry by the RegistryFactory.
///         The verification contract calls register() during asset registration.
///         Only the owner can revoke assets. Anyone can read status (no gas).
contract RevocationRegistry {

    // ============================================
    // ENUMS
    // ============================================

    enum RevocationReason {
        NONE,
        EXPIRED,
        SUPERSEDED,
        KEY_COMPROMISE,
        AFFILIATION_CHANGED,
        CESSATION_OF_OPERATION,
        PRIVILEGE_WITHDRAWN,
        ADMINISTRATIVE_ERROR,
        FRAUDULENT,
        FORMAT_INVALID,
        OTHER
    }

    // ============================================
    // STATE
    // ============================================

    address public owner;
    address public verificationContract;

    mapping(bytes32 => bool) private registered;
    mapping(bytes32 => bool) private revoked;
    mapping(bytes32 => RevocationReason) private revocationReasons;

    // ============================================
    // EVENTS
    // ============================================

    event Registered(bytes32 indexed hash, uint256 timestamp);
    event Revoked(bytes32 indexed hash, RevocationReason reason, uint256 timestamp);
    event VerificationContractSet(address indexed contractAddress);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============================================
    // MODIFIERS
    // ============================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyVerificationContract() {
        require(msg.sender == verificationContract, "Not verification contract");
        _;
    }

    // ============================================
    // CONSTRUCTOR
    // ============================================

    /// @param initialOwner Address that will own this contract.
    ///        The factory passes address(this) as temp owner, then
    ///        transfers to the user after linking.
    constructor(address initialOwner) {
        require(initialOwner != address(0), "Invalid owner");
        owner = initialOwner;
    }

    // ============================================
    // CONFIGURATION
    // ============================================

    /// @notice Link to the paired verification contract. Can only be called once.
    function setVerificationContract(address _verificationContract) external onlyOwner {
        require(verificationContract == address(0), "Already linked");
        require(_verificationContract != address(0), "Invalid address");
        verificationContract = _verificationContract;
        emit VerificationContractSet(_verificationContract);
    }

    // ============================================
    // OWNERSHIP
    // ============================================

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    // ============================================
    // REGISTRATION (called by verification contract)
    // ============================================

    /// @notice Mirror-register a hash. Called automatically by the
    ///         verification contract during asset registration.
    function register(bytes32 hash) external onlyVerificationContract {
        require(!registered[hash], "Already registered");
        registered[hash] = true;
        emit Registered(hash, block.timestamp);
    }

    // ============================================
    // REVOCATION (called by owner)
    // ============================================

    /// @notice Revoke a previously registered asset hash.
    function revoke(bytes32 hash, RevocationReason reason) external onlyOwner {
        require(registered[hash], "Not registered");
        require(!revoked[hash], "Already revoked");
        require(reason != RevocationReason.NONE, "Must provide reason");

        revoked[hash] = true;
        revocationReasons[hash] = reason;
        emit Revoked(hash, reason, block.timestamp);
    }

    // ============================================
    // VIEW FUNCTIONS (no gas)
    // ============================================

    function isRegistered(bytes32 hash) external view returns (bool) {
        return registered[hash];
    }

    function isRevoked(bytes32 hash) external view returns (bool) {
        return revoked[hash];
    }

    /// @notice Returns true only if the hash is registered AND not revoked.
    function isValid(bytes32 hash) external view returns (bool) {
        return registered[hash] && !revoked[hash];
    }

    function getRevocationReason(bytes32 hash) external view returns (RevocationReason) {
        return revocationReasons[hash];
    }

    /// @notice Get full status in one call.
    function getStatus(bytes32 hash) external view returns (
        bool exists,
        bool valid,
        RevocationReason reason
    ) {
        exists = registered[hash];
        valid = exists && !revoked[hash];
        reason = revocationReasons[hash];
    }
}
