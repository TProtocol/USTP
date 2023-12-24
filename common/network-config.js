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

	layerZeroEndpoint: "0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23",
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
	rUSTPAddess: "0x38a1753AEd353e58c64a55a3f3c750E919915537",
	iUSTPAddess: "0x36df9B0F5e50b6F1341e8D90b222dAa0B5dc385b",
	USTPAddess: "0xed4d84225273c867d269F967CC696e0877068f8a",
	USTPHelper: "0x8a3766Dd21B5460519d2c32eb3A57248c6954E4e",

	layerZeroEndpoint: "0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675",
}

// Sepolia Settings
const SepoliaAddressConfig = {
	adminAddress: adminAddress,
	mpRedeemPoolAddress: "0xDEE9Ed3B19d104ADBbE255B6bEFC680b4eaAAda3",
	stbtAddress: "0xd46b30eB86861dd5A159BF49b380762992054A9B",
	daiAddress: "0xE307647A5cfA49d55d87552369c29a9f1a13ae8A",
	usdcAddress: "0xf7B6d04C21dB982A47086953e677B26420D7d027",
	usdtAddress: "0xc0B4247D396667D7457C78f5767F0a09dA556f2b",

	// Mock
	PriceFeedAddress: "0x058f10Ee12Ab1Bd271FE44B98f8Fd50bb9A0d3F9",
	rUSTPAddess: "0x3588D66D8bCA44047c8FeA04b12cEE77F1f3E57D",
	iUSTPAddess: "0x92F2FB4fC1eC87a08AcBb9174F880C877f61199b",
	USTPAddess: "0x136070ca17df2b46453da3705cfAC65022EB953f",
	USTPHelper: "0x9A055025553568f56d6809bD9317d68CB854f6ED",
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
const USTPHelperId = "USTPHelper"
const LooperManagerId = "LooperManager"
const BorrowLooperId = "BorrowLooper"
const SwapRouterId = "SwapRouter"

const USTP_OFTV2Id = "USTP_OFTV2"

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
	USTPHelperId,
	LooperManagerId,
	BorrowLooperId,
	SwapRouterId,
	USTP_OFTV2Id,
}
