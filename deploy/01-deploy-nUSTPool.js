const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, AddressConfig, nUSTPoolId } = require("../common/network-config")
const { verify } = require("../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const nUSTPoolArgs = [config.adminAddress, config.stbtAddress, config.usdcAddress]
	const deployResult = await deploy(nUSTPoolId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: nUSTPoolArgs,
	})

	const nUSTPool = await ethers.getContractAt(nUSTPoolId, deployResult.address)

	log(`🎉 nUSTPool deployed at ${nUSTPool.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(nUSTPool.address, nUSTPoolArgs)
	}
}

module.exports.tags = ["nUSTPool", "all"]
