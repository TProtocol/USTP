const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, AddressConfig } = require("../common/network-config")
const { verify } = require("../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const wtbt = "0xD38e031f4529a07996aaB977d2B79f0e00656C56"
	const treasury = "0xa01D9bc8343016C7DDD39852e49890a8361B2884"
	const borrower = "0x7d273212AED9651797701a9dFb8e636F6Ba832b2"
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
