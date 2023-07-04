const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, AddressConfig, rUSTPoolId } = require("../common/network-config")
const { verify } = require("../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const rUSTPoolArgs = [config.adminAddress, config.stbtAddress, config.usdcAddress]
	const deployResult = await deploy(rUSTPoolId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: rUSTPoolArgs,
	})

	const rUSTPool = await ethers.getContractAt(rUSTPoolId, deployResult.address)

	log(`🎉 rUSTPool deployed at ${rUSTPool.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(rUSTPool.address, rUSTPoolArgs)
	}
}

module.exports.tags = ["rUSTPool", "all"]
