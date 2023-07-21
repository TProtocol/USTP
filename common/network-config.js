const developmentChains = ["hardhat"]

const adminAddress = "0x31b8939C6e55A4DDaF0d6479320A0DFD9766EE9D"
// Goerli Testnet Settings
const GoerliAddressConfig = {
	adminAddress: adminAddress,
	mpRedeemPoolAddress: "0x199E9C9A58e0CF6D26c4e753693644Ca65A4c497",
	stbtAddress: "0x0f539454d2Effd45E9bFeD7C57B2D48bFd04CB32",
	daiAddress: "0x73967c6a0904aA032C103b4104747E88c566B1A2",
	usdcAddress: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F",
	usdtAddress: "0x509Ee0d083DdF8AC028f2a56731412edD63223B9",

	// Chainlink: USDC/USD Price Feed
	PriceFeedAddress: "0xAb5c49580294Aff77670F839ea425f5b78ab3Ae7",
}

// Mainnet Settings
const MainnetAddressConfig = {
	adminAddress: adminAddress,
	mpRedeemPoolAddress: "0xDEE9Ed3B19d104ADBbE255B6bEFC680b4eaAAda3",
	stbtAddress: "0x530824DA86689C9C17CdC2871Ff29B058345b44a",
	daiAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
	usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
	usdtAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
	// Chainlink: USDC/USD Price Feed
	PriceFeedAddress: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
}

// Sepolia Settings
const SepoliaAddressConfig = {
	adminAddress: adminAddress,
	mpRedeemPoolAddress: "0xDEE9Ed3B19d104ADBbE255B6bEFC680b4eaAAda3",
	stbtAddress: "0xD5e5B66513b8918155eC9E22C9780Ec51c2f806d",
	daiAddress: "0xE307647A5cfA49d55d87552369c29a9f1a13ae8A",
	usdcAddress: "0xc31dbBA1A491C5cF5c7B39AF63E61F782215FFaB",
	usdtAddress: "0xc0B4247D396667D7457C78f5767F0a09dA556f2b",

	// Mock
	PriceFeedAddress: "0xa326A5e3febcA76E3dA66cB90aaC75BBcaD03949",
}

const AddressConfig = {
	1: MainnetAddressConfig,
	5: GoerliAddressConfig,
	1337: MainnetAddressConfig,
	11155111: SepoliaAddressConfig,
}

const rUSTPoolId = "rUSTPool"
const InterestRateModelId = "InterestRateModel"
const LiquidatePoolId = "LiquidatePool"
const iUSTPId = "iUSTP"
const USTPId = "USTP"

const testnetId = {
	dai: "DaiToken",
	usdt: "UsdtToken",
	usdc: "UsdcToken",
	stbt: "StbtToken",
	CrvToken: "3Crv",
	CrvPool: "3CrvPool",
	CrvStableSwap: "StableSwap",
}

module.exports = {
	developmentChains,
	AddressConfig,
	rUSTPoolId,
	InterestRateModelId,
	LiquidatePoolId,
	iUSTPId,
	USTPId,
	testnetId,
}
