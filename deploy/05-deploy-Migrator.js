const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, AddressConfig } = require("../common/network-config")
const { verify } = require("../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const wtbt = "0x7C92EC6E0b7e1fb3E2bBbCbf5ACE74C2b9bC9407"
	const treasury = "0x07Ac55797D4F43f57cA92a49E65ca582cC287c27"
	const borrower = "0xEAb746DE6bd1b2714ed95AaB6945B82315613264"
	const MigratorArgs = [
		config.adminAddress,
		config.rUSTPAddess,
		wtbt,
		treasury,
		config.stbtAddress,
		borrower,
	]
	const deployResult = await deploy("migrator", {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: MigratorArgs,
	})

	const migrator = await ethers.getContractAt("migrator", deployResult.address)

	log(`🎉 Migrator deployed at ${migrator.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying migrator on Etherscan...")
		await verify(migrator.address, MigratorArgs)
	}
}

module.exports.tags = ["Migrator", "all"]
