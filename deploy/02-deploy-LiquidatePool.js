const { getNamedAccounts, deployments, network } = require("hardhat")
const {
	developmentChains,
	AddressConfig,
	rUSTPoolId,
	LiquidatePoolId,
} = require("../common/network-config")
const { verify } = require("../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const rUSTPool = await ethers.getContractAt(
		rUSTPoolId,
		(
			await deployments.get(rUSTPoolId)
		).address
	)

	const LiquidatePoolArgs = [
		config.adminAddress,
		rUSTPool.address,
		config.mpRedeemPoolAddress,
		config.stbtAddress,
		config.usdcAddress,
		config.PriceFeedAddress,
		[config.daiAddress, config.usdcAddress, config.usdtAddress],
	]
	const deployResult = await deploy(LiquidatePoolId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: LiquidatePoolArgs,
	})

	const LiquidatePool = await ethers.getContractAt(LiquidatePoolId, deployResult.address)

	log(`🎉 LiquidatePool deployed at ${LiquidatePool.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(LiquidatePool.address, LiquidatePoolArgs)
	}
}

module.exports.tags = ["LiquidatePool", "all"]
