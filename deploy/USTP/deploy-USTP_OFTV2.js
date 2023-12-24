const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, AddressConfig, USTP_OFTV2Id } = require("../common/network-config")
const { verify } = require("../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const USTP_OFTV2Args = [config.layerZeroEndpoint]
	const deployResult = await deploy(USTP_OFTV2Id, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: USTP_OFTV2Args,
	})

	const USTP_OFTV2 = await ethers.getContractAt(USTP_OFTV2Id, deployResult.address)

	log(`🎉 USTP_OFTV2 deployed at ${USTP_OFTV2.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(USTP_OFTV2.address, USTPArgs)
	}
}

module.exports.tags = ["USTP_OFTV2", "all"]
