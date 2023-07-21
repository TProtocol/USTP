const { getNamedAccounts, deployments, network } = require("hardhat")
const { developmentChains, InterestRateModelId } = require("../../common/network-config")
const { verify } = require("../../common/verify")

module.exports = async ({ getNamedAccounts, deployments }) => {
	const { deploy, log } = deployments
	const { deployerAccount } = await getNamedAccounts()
	const deployer = await ethers.getSigner(deployerAccount)

	const ERC20Token = await ethers.getContractFactory("ERC20Token")
	let daiToken = await ERC20Token.connect(deployer).deploy("DAI", "DAI", 18)
	let usdcToken = await ERC20Token.connect(deployer).deploy("USDC", "USDC", 6)
	let usdtToken = await ERC20Token.connect(deployer).deploy("USDT", "USDT", 6)
	await daiToken.deployed()
	await usdcToken.deployed()
	await usdtToken.deployed()
	let stbtToken = await ERC20Token.connect(deployer).deploy("STBT", "STBT", 18)
	await stbtToken.deployed()
	await stbtToken
		.connect(deployer)
		.mint(deployer.address, ethers.utils.parseUnits("1000000000", 18)) // 1 billion STBT

	const coins = [daiToken, usdcToken, usdtToken]

	for (let coin of coins) {
		await coin.deployed()
		await coin
			.connect(deployer)
			.mint(deployer.address, ethers.utils.parseUnits("1000000000", 18))
	}
	const _3CrvFactory = await ethers.getContractFactory("3Crv")
	let _3Crv = await _3CrvFactory.connect(deployer).deploy("Curve.fi DAI/USDC/USDT", "3Crv", 18, 0)
	await _3Crv.deployed()
	const _3CrvPoolFactory = await ethers.getContractFactory("3CrvPool")
	let _3CrvPool = await _3CrvPoolFactory
		.connect(deployer)
		.deploy(
			deployer.address,
			[daiToken.address, usdcToken.address, usdtToken.address],
			_3Crv.address,
			100,
			4000000,
			0
		)
	await _3CrvPool.deployed()
	await _3Crv.connect(deployer).set_minter(_3CrvPool.address)

	// approve 3Crv pool
	for (let coin of coins) {
		await coin
			.connect(deployer)
			.approve(_3CrvPool.address, ethers.utils.parseUnits("1000000000", 18))
	}

	await stbtToken
		.connect(deployer)
		.approve(_3CrvPool.address, ethers.utils.parseUnits("1000000000", 18))
	await _3CrvPool.connect(deployer).add_liquidity(
		[
			ethers.utils.parseUnits("1000000", 18), // 1M dai
			ethers.utils.parseUnits("1000000", 6), // 1M usdc
			ethers.utils.parseUnits("1000000", 6), // 1M usdt
		],
		0
	)
	const stbtSwapPoolFactory = await ethers.getContractFactory("StableSwap")
	let stbtSwapPool = await stbtSwapPoolFactory.connect(deployer).deploy()
	await stbtSwapPool.deployed()

	await stbtSwapPool.initialize(
		"STBT/3CRV",
		"STBT/3CRV",
		stbtToken.address,
		_3Crv.address,
		_3CrvPool.address,
		[daiToken.address, usdcToken.address, usdtToken.address],
		ethers.utils.parseUnits("1", 18), // 10**18
		200,
		4000000
	)

	// approve token for StableSwap
	await _3Crv
		.connect(deployer)
		.approve(stbtSwapPool.address, ethers.utils.parseUnits("1000000000", 18))
	await stbtToken
		.connect(deployer)
		.approve(stbtSwapPool.address, ethers.utils.parseUnits("1000000000", 18))

	await stbtSwapPool.connect(deployer)["add_liquidity(uint256[2],uint256)"](
		[
			ethers.utils.parseUnits("1000000", 18), // 1M stbt
			ethers.utils.parseUnits("1000000", 18), // 1M 3Crv
		],
		0
	)
	const PriceFeed = await ethers.getContractFactory("MockPriceFeed")
	let priceFeed = await PriceFeed.connect(deployer).deploy()
	await priceFeed.deployed()

	const rUSTPool = await ethers.getContractFactory("rUSTPool")
	let rustpool = await rUSTPool
		.connect(deployer)
		.deploy(deployer.address, stbtToken.address, usdcToken.address)
	await rustpool.deployed()
	// SET ROLE
	let POOL_MANAGER_ROLE = await rustpool.POOL_MANAGER_ROLE()
	await rustpool.connect(deployer).grantRole(POOL_MANAGER_ROLE, deployer.address)

	const LiquidatePool = await ethers.getContractFactory("LiquidatePool")
	let liquidatePool = await LiquidatePool.connect(deployer).deploy(
		deployer.address,
		rustpool.address,
		deployer.address,
		stbtToken.address,
		usdcToken.address,
		priceFeed.address,
		[daiToken.address, usdcToken.address, usdtToken.address]
	)
	await liquidatePool.deployed()

	const InterestRateModel = await ethers.getContractFactory("InterestRateModel")
	let interestRateModel = await InterestRateModel.connect(deployer).deploy()
	await interestRateModel.deployed()

	const iUSTP = await ethers.getContractFactory("iUSTP")
	let iUSTPtoken = await iUSTP.connect(deployer).deploy(deployer.address, rustpool.address)
	await iUSTPtoken.deployed()

	await liquidatePool.connect(deployer).setCurvePool(stbtSwapPool.address)
	await liquidatePool.connect(deployer).setRedeemPool(deployer.address)
	await rustpool.connect(deployer).initLiquidatePool(liquidatePool.address)
	await rustpool.connect(deployer).setInterestRateModel(interestRateModel.address)
	await liquidatePool.connect(deployer).setFeeCollector(deployer.address)
}

module.exports.tags = ["CruvePool", "testnet"]
