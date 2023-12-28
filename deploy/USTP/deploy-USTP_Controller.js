const { getNamedAccounts, deployments, network } = require("hardhat")
const {
	developmentChains,
	AddressConfig,
	USTP_ControllerId,
} = require("../../common/network-config")
const { verify } = require("../../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]
	const USTP_ControllerArgs = [config.adminAddress]

	const deployResult = await deploy(USTP_ControllerId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: USTP_ControllerArgs,
	})

	const USTP_Controller = await ethers.getContractAt(USTP_ControllerId, deployResult.address)

	log(`🎉 USTP_Controller deployed at ${USTP_Controller.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(USTP_Controller.address, USTP_ControllerArgs)
	}
}

module.exports.tags = ["USTP_Controller", "all"]
