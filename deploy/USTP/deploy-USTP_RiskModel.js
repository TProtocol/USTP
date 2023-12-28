const { getNamedAccounts, deployments, network } = require("hardhat")
const {
	developmentChains,
	AddressConfig,
	rUSTPRiskModelId,
} = require("../../common/network-config")
const { verify } = require("../../common/verify")
const { config } = require("dotenv")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]
	const USTP_RiskModelArgs = [
		config.ustpRiskModelPool,
		config.ustpRiskModelBase,
		config.ustpRiskModelQuote,
	]

	const deployResult = await deploy(rUSTPRiskModelId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: USTP_RiskModelArgs,
	})

	const USTP_RiskModel = await ethers.getContractAt(rUSTPRiskModelId, deployResult.address)

	log(`🎉 USTP_RiskModel deployed at ${USTP_RiskModel.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(USTP_RiskModel.address, USTP_RiskModelArgs)
	}
}

module.exports.tags = ["USTP_RiskModel", "all"]
