const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, AddressConfig, USTPId } = require("../../common/network-config")
const { verify } = require("../../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()

	const config = AddressConfig[network.config.chainId]

	const USTPArgs = [config.adminAddress, config.rUSTPAddess]
	const deployResult = await deploy(USTPId, {
		from: deployer,
		log: true,
		waitConfirmations: 5,
		args: USTPArgs,
	})

	const USTP = await ethers.getContractAt(USTPId, deployResult.address)

	log(`🎉 USTP deployed at ${USTP.address}`)

	if (!developmentChains.includes(network.name)) {
		console.log("Waiting for 1min to wait for etherscan to index the contract...")
		await new Promise((resolve) => setTimeout(resolve, 60000))
		console.log("Verifying vault on Etherscan...")
		await verify(USTP.address, USTPArgs)
	}
}

module.exports.tags = ["USTP-test", "testnet"]
