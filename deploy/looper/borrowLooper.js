const { getNamedAccounts, deployments, network, upgrades } = require("hardhat")
const { developmentChains, AddressConfig, BorrowLooperId } = require("../../common/network-config")
const { verify } = require("../../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const looper = await ethers.getContractFactory(BorrowLooperId)

	const proxy = await upgrades.deployProxy(
		looper,
		[config.adminAddress, config.rUSTPAddess, config.stbtAddress, config.usdcAddress],
		{
			from: deployer,
			log: true,
			waitConfirmations: 10,
		}
	)

	await proxy.deployed()

	log(`🎉 Looper deployed at ${proxy.address}`)
	if (!developmentChains.includes(network.name)) {
		// sleep for 1min to wait for etherscan to index the contract
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))

		console.log("Verifying Looper on Etherscan...")
		await verify(proxy.address)
	}
}

module.exports.tags = ["BorrowLooper", "helper"]
