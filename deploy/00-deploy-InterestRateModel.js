const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, InterestRateModelId } = require("../common/network-config")
const { verify } = require("../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const deployResult = await deploy(InterestRateModelId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
	})

	const InterestRateModel = await ethers.getContractAt(InterestRateModelId, deployResult.address)

	log(`🎉 InterestRateModel deployed at ${InterestRateModel.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(InterestRateModel.address)
	}
}

module.exports.tags = ["InterestRateModel", "all"]
