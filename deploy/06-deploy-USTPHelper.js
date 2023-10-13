const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, AddressConfig, USTPHelperId } = require("../common/network-config")
const { verify } = require("../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const USTPHelperArgs = [
		config.rUSTPAddess,
		config.iUSTPAddess,
		config.USTPAddess,
		config.usdcAddress,
		config.oneInchAddress,
		config.adminAddress,
	]
	const deployResult = await deploy(USTPHelperId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: USTPHelperArgs,
	})

	const USTPHelper = await ethers.getContractAt(USTPHelperId, deployResult.address)

	log(`🎉 USTPHelper deployed at ${USTPHelper.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(USTPHelper.address, USTPHelperArgs)
	}
}

module.exports.tags = ["USTPHelper", "mainnet"]
