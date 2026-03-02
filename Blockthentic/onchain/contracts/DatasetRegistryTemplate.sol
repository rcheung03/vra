// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRevocationRegistry.sol";

contract DatasetRegistryTemplate {
    struct Dataset {
        bytes32 dataHash;
        address issuer;
        uint256 createdAt;
        string uri;
    }

    address public owner;
    address public revocationRegistry;
    mapping(bytes32 => Dataset) private datasets;

    event DatasetRegistered(bytes32 indexed datasetId, bytes32 indexed dataHash, address indexed issuer, string uri, uint256 timestamp);
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

    function registerDataset(bytes32 datasetId, bytes32 dataHash, string calldata uri) external onlyOwner {
        require(datasets[datasetId].createdAt == 0, "Dataset exists");
        require(dataHash != bytes32(0), "Invalid hash");

        datasets[datasetId] = Dataset({
            dataHash: dataHash,
            issuer: msg.sender,
            createdAt: block.timestamp,
            uri: uri
        });

        // Mirror-register on the paired revocation registry
        if (revocationRegistry != address(0)) {
            IRevocationRegistry(revocationRegistry).register(dataHash);
        }

        emit DatasetRegistered(datasetId, dataHash, msg.sender, uri, block.timestamp);
    }

    function verifyDataset(bytes32 datasetId, bytes32 dataHash) external view returns (bool) {
        Dataset memory ds = datasets[datasetId];
        return ds.createdAt != 0 && ds.dataHash == dataHash;
    }
}
