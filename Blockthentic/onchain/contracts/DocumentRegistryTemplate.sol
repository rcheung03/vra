// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRevocationRegistry.sol";

contract DocumentRegistryTemplate {
    struct Document {
        bytes32 docHash;
        address issuer;
        uint256 issuedAt;
        string uri;
    }

    address public owner;
    address public revocationRegistry;
    mapping(bytes32 => Document) private documents;

    event DocumentRegistered(bytes32 indexed docId, bytes32 indexed docHash, address indexed issuer, string uri, uint256 timestamp);
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

    function registerDocument(bytes32 docId, bytes32 docHash, string calldata uri) external onlyOwner {
        require(documents[docId].issuedAt == 0, "Document exists");
        require(docHash != bytes32(0), "Invalid hash");

        documents[docId] = Document({
            docHash: docHash,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            uri: uri
        });

        // Mirror-register on the paired revocation registry
        if (revocationRegistry != address(0)) {
            IRevocationRegistry(revocationRegistry).register(docHash);
        }

        emit DocumentRegistered(docId, docHash, msg.sender, uri, block.timestamp);
    }

    function verifyDocument(bytes32 docId, bytes32 docHash) external view returns (bool) {
        Document memory doc = documents[docId];
        return doc.issuedAt != 0 && doc.docHash == docHash;
    }
}
