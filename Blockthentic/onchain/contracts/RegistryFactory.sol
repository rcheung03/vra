// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RevocationRegistry.sol";
import "./DocumentRegistryTemplate.sol";
import "./DatasetRegistryTemplate.sol";
import "./MediaRegistryTemplate.sol";

contract RegistryFactory {
    enum TemplateType {
        DOCUMENT,
        DATASET,
        MEDIA
    }

    struct RegistryRecord {
        uint256 id;
        address owner;
        TemplateType templateType;
        address verificationRegistry;
        address revocationRegistry;
        bytes32 configHash;
        string name;
        uint256 createdAt;
    }

    uint256 public nextRegistryId = 1;
    mapping(uint256 => RegistryRecord) public registries;
    mapping(address => uint256[]) private ownerRegistryIds;

    event RegistryCreated(
        uint256 indexed registryId,
        address indexed owner,
        uint8 templateType,
        address verificationRegistry,
        address revocationRegistry,
        bytes32 configHash,
        string name
    );

    function createRegistry(uint8 templateType, bytes32 configHash, string calldata name)
        external
        returns (uint256 registryId, address verificationRegistry, address revocationRegistry)
    {
        require(bytes(name).length > 0, "Name required");
        require(templateType <= uint8(TemplateType.MEDIA), "Invalid template");

        TemplateType t = TemplateType(templateType);

        // -----------------------------------------------------------
        // Step 1: Deploy revocation registry FIRST.
        //         Factory (address(this)) is temporary owner so
        //         the factory can call setVerificationContract() and
        //         then transfer ownership to the user.
        // -----------------------------------------------------------
        RevocationRegistry revoc = new RevocationRegistry(address(this));
        revocationRegistry = address(revoc);

        // -----------------------------------------------------------
        // Step 2: Deploy the verification registry.
        //         User (msg.sender) is the owner.
        //         Pass the revocation registry address for tight coupling.
        // -----------------------------------------------------------
        if (t == TemplateType.DOCUMENT) {
            verificationRegistry = address(new DocumentRegistryTemplate(msg.sender, revocationRegistry));
        } else if (t == TemplateType.DATASET) {
            verificationRegistry = address(new DatasetRegistryTemplate(msg.sender, revocationRegistry));
        } else {
            verificationRegistry = address(new MediaRegistryTemplate(msg.sender, revocationRegistry));
        }

        // -----------------------------------------------------------
        // Step 3: Link the tightly coupled pair.
        //         Factory is the current owner of revoc, so it can
        //         call setVerificationContract().
        // -----------------------------------------------------------
        revoc.setVerificationContract(verificationRegistry);

        // -----------------------------------------------------------
        // Step 4: Transfer revocation registry ownership to user.
        //         After this, only the user's wallet can revoke.
        // -----------------------------------------------------------
        revoc.transferOwnership(msg.sender);

        // -----------------------------------------------------------
        // Step 5: Store record and emit event.
        // -----------------------------------------------------------
        registryId = nextRegistryId++;

        registries[registryId] = RegistryRecord({
            id: registryId,
            owner: msg.sender,
            templateType: t,
            verificationRegistry: verificationRegistry,
            revocationRegistry: revocationRegistry,
            configHash: configHash,
            name: name,
            createdAt: block.timestamp
        });

        ownerRegistryIds[msg.sender].push(registryId);

        emit RegistryCreated(
            registryId,
            msg.sender,
            templateType,
            verificationRegistry,
            revocationRegistry,
            configHash,
            name
        );
    }

    function getOwnerRegistries(address owner) external view returns (uint256[] memory) {
        return ownerRegistryIds[owner];
    }
}
