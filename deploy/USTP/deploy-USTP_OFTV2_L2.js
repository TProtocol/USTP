const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, AddressConfig, USTP_OFT_L2V2Id } = require("../../common/network-config")
const { verify } = require("../../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const USTP_OFT_L2V2Args = [config.layerZeroEndpoint]
	const deployResult = await deploy(USTP_OFT_L2V2Id, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: USTP_OFT_L2V2Args,
	})

	const USTP_OFT_L2V2 = await ethers.getContractAt(USTP_OFT_L2V2Id, deployResult.address)

	log(`🎉 USTP_OFT_L2V2 deployed at ${USTP_OFT_L2V2.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 6000))
		console.log("Verifying vault on Etherscan...")
		await verify(USTP_OFT_L2V2.address, USTP_OFT_L2V2Args)
	}
}

module.exports.tags = ["USTP_OFTV2_L2", "all"]
