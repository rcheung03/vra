const hre = require("hardhat");

async function main() {
  const Factory = await hre.ethers.getContractFactory("RegistryFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const addr = await factory.getAddress();

  console.log("RegistryFactory deployed:", addr);
  console.log("Use this in app.json for this network.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
