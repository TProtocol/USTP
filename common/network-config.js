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
	stbtAddress: "0x93E8b62F8b5b9669f8dfd235d6fd3aEb1da689a3",
	daiAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
	usdcAddress: "0x9B06975EfE73334946BC96bC411fA17B68195A5C",
	usdtAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",

	// Chainlink: USDC/USD Price Feed
	PriceFeedAddress: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
}

const AddressConfig = {
	1: MainnetAddressConfig,
	5: GoerliAddressConfig,
	1337: MainnetAddressConfig,
	11155111: SepoliaAddressConfig,
}

const nUSTPoolId = "nUSTPool"
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
	nUSTPoolId,
	InterestRateModelId,
	LiquidatePoolId,
	iUSTPId,
	USTPId,
	testnetId,
}
