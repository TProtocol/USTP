require("@nomicfoundation/hardhat-toolbox")
require("@openzeppelin/hardhat-upgrades")
require("@nomiclabs/hardhat-vyper")
require("@nomiclabs/hardhat-etherscan")
require("hardhat-deploy")
require("dotenv").config()

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY
const DEPLOYER_KEY = process.env.DEPLOYER_KEY
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	vyper: {
		compilers: [{ version: "0.3.7" }, { version: "0.2.4" }],
	},
	solidity: {
		version: "0.8.18",
		settings: {
			optimizer: {
				enabled: true,
				runs: 1000,
			},
		},
	},
	networks: {
		hardhat: {
			chainId: 1337,
		},
		goerli: {
			url: "https://eth-goerli.g.alchemy.com/v2/" + ALCHEMY_API_KEY,
			chainId: 5,
			accounts: [DEPLOYER_KEY],
			confirmations: 2,
		},
		sepolia: {
			url: "https://eth-sepolia.g.alchemy.com/v2/" + ALCHEMY_API_KEY,
			chainId: 11155111,
			accounts: [DEPLOYER_KEY],
			confirmations: 2,
		},
		mainnet: {
			url: "https://eth-mainnet.g.alchemy.com/v2/" + ALCHEMY_API_KEY,
			chainId: 1,
			accounts: [DEPLOYER_KEY],
			confirmations: 2,
		},
	},
	etherscan: {
		apiKey: {
			mainnet: ETHERSCAN_API_KEY,
			goerli: ETHERSCAN_API_KEY,
			sepolia: ETHERSCAN_API_KEY,
		},
	},
	namedAccounts: {
		deployer: {
			default: 0,
		},
	},
}
