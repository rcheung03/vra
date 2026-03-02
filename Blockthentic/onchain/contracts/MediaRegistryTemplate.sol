// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRevocationRegistry.sol";

contract MediaRegistryTemplate {
    struct Media {
        bytes32 mediaHash;
        address issuer;
        uint256 createdAt;
        string uri;
    }

    address public owner;
    address public revocationRegistry;
    mapping(bytes32 => Media) private mediaRecords;

    event MediaRegistered(bytes32 indexed mediaId, bytes32 indexed mediaHash, address indexed issuer, string uri, uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address initialOwner, address _revocationRegistry) {
        require(initialOwner != address(0), "Invalid owner");
        owner = initialOwner;
        revocationRegistry = _revocationRegistry;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function registerMedia(bytes32 mediaId, bytes32 mediaHash, string calldata uri) external onlyOwner {
        require(mediaRecords[mediaId].createdAt == 0, "Media exists");
        require(mediaHash != bytes32(0), "Invalid hash");

        mediaRecords[mediaId] = Media({
            mediaHash: mediaHash,
            issuer: msg.sender,
            createdAt: block.timestamp,
            uri: uri
        });

        // Mirror-register on the paired revocation registry
        if (revocationRegistry != address(0)) {
            IRevocationRegistry(revocationRegistry).register(mediaHash);
        }

        emit MediaRegistered(mediaId, mediaHash, msg.sender, uri, block.timestamp);
    }

    function verifyImage(bytes32 mediaId, bytes32 mediaHash) external view returns (bool) {
        Media memory m = mediaRecords[mediaId];
        return m.createdAt != 0 && m.mediaHash == mediaHash;
    }
}
