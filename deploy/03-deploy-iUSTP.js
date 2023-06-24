const { getNamedAccounts, deployments, network } = require("hardhat")
const {
	developmentChains,
	AddressConfig,
	nUSTPoolId,
	iUSTPId,
} = require("../common/network-config")
const { verify } = require("../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]
	const nUSTPool = await ethers.getContractAt(
		nUSTPoolId,
		(
			await deployments.get(nUSTPoolId)
		).address
	)

	const iUSTPArgs = [config.adminAddress, nUSTPool.address]
	const deployResult = await deploy(iUSTPId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: iUSTPArgs,
	})

	const iUSTP = await ethers.getContractAt(iUSTPId, deployResult.address)

	log(`🎉 iUSTP deployed at ${iUSTP.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(iUSTP.address, iUSTPArgs)
	}
}

module.exports.tags = ["iUSTP", "all"]
