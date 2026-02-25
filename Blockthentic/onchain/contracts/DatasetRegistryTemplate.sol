// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DatasetRegistryTemplate {
    struct Dataset {
        bytes32 dataHash;
        address issuer;
        uint256 createdAt;
        string uri;
    }

    address public owner;
    mapping(bytes32 => Dataset) private datasets;

    event DatasetRegistered(bytes32 indexed datasetId, bytes32 indexed dataHash, address indexed issuer, string uri, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "Invalid owner");
        owner = initialOwner;
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

        emit DatasetRegistered(datasetId, dataHash, msg.sender, uri, block.timestamp);
    }

    function verifyDataset(bytes32 datasetId, bytes32 dataHash) external view returns (bool) {
        Dataset memory ds = datasets[datasetId];
        return ds.createdAt != 0 && ds.dataHash == dataHash;
    }
}
