const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, AddressConfig, SwapRouterId } = require("../common/network-config")
const { verify } = require("../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const SwapRouterArgs = [
		config.rUSTPAddess,
		config.iUSTPAddess,
		config.USTPAddess,
		config.USTPHelper,
	]
	const deployResult = await deploy(SwapRouterId, {
		from: deployer,
		log: true,
		waitConfirmations: 0,
		args: SwapRouterArgs,
	})

	const SwapRouter = await ethers.getContractAt(SwapRouterId, deployResult.address)

	log(`🎉 SwapRouter deployed at ${SwapRouter.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(SwapRouter.address, SwapRouterArgs)
	}
}

module.exports.tags = ["SwapRouter", "mainnet"]
