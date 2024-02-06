const { ethers } = require("hardhat")

const permission = {
	sendAllowed: true,
	receiveAllowed: true,
	expiryTime: 0,
}

async function deployMockwTBT(deployer) {
	const MockwTBT = await ethers.getContractFactory("MockwTBT")
	let wtbtToken = await MockwTBT.connect(deployer).deploy()
	await wtbtToken.deployed()

	return { wtbtToken }
}

async function deployWSTBT(deployer, stbtToken) {
	const WSTBT = await ethers.getContractFactory("WSTBT")
	let wstbtToken = await WSTBT.connect(deployer).deploy("WSTBT", "WSTBT", stbtToken.address)
	await wstbtToken.deployed()

	return { wstbtToken }
}

async function deployMockTreasury(deployer, recovery) {
	const MockTreasury = await ethers.getContractFactory("MockTreasury")
	let mockTreasury = await MockTreasury.connect(deployer).deploy(recovery.address)
	await mockTreasury.deployed()

	return { mockTreasury }
}

async function deployMockMinter(deployer, stbtToken, mxpRedeemPool) {
	const MockMinter = await ethers.getContractFactory("MockMinter")
	let mockMinter = await MockMinter.connect(deployer).deploy(
		stbtToken.address,
		mxpRedeemPool.address
	)
	await mockMinter.deployed()

	return { mockMinter }
}

async function deployMigrator(deployer, rustpool, wtbt, treasury, stbt, borrower) {
	const Migrator = await ethers.getContractFactory("migrator")
	let migrator = await Migrator.connect(deployer).deploy(
		deployer.address,
		rustpool.address,
		wtbt.address,
		treasury.address,
		stbt.address,
		borrower.address
	)
	await migrator.deployed()

	return { migrator }
}

async function deployTokensFixture(deployer, investor, investor2) {
	const ERC20Token = await ethers.getContractFactory("ERC20Token")
	let daiToken = await ERC20Token.connect(deployer).deploy("DAI", "DAI", 18)
	let usdcToken = await ERC20Token.connect(deployer).deploy("USDC", "USDC", 6)
	let usdtToken = await ERC20Token.connect(deployer).deploy("USDT", "USDT", 6)
	await daiToken.deployed()
	await usdcToken.deployed()
	await usdtToken.deployed()

	await usdcToken
		.connect(deployer)
		.mint(investor.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC
	await usdcToken
		.connect(deployer)
		.mint(investor2.address, ethers.utils.parseUnits("1000000000", 6)) // 1 billion USDC

	return { daiToken, usdcToken, usdtToken }
}

async function deploySTBTTokensFixture(deployer, investor, investor2) {
	const STBTToken = await ethers.getContractFactory("STBT")
	let stbtToken = await STBTToken.connect(deployer).deploy()
	await stbtToken.deployed()
	await stbtToken.connect(deployer).setIssuer(deployer.address)
	await stbtToken.connect(deployer).setController(deployer.address)
	await stbtToken.connect(deployer).setModerator(deployer.address)

	await stbtToken.connect(deployer).setPermission(deployer.address, permission)
	await stbtToken.connect(deployer).setPermission(investor.address, permission)
	await stbtToken.connect(deployer).setPermission(investor2.address, permission)
	await stbtToken.connect(deployer).setMaxDistributeRatio(ethers.utils.parseUnits("1", 18))
	await stbtToken
		.connect(deployer)
		.issue(investor.address, ethers.utils.parseUnits("1000000000", 18), []) // 1 billion STBT
	await stbtToken
		.connect(deployer)
		.issue(investor2.address, ethers.utils.parseUnits("1000000000", 18), []) // 1 billion STBT

	return { stbtToken }
}

async function deployCurvePoolFixture(deployer, daiToken, usdcToken, usdtToken, stbtToken) {
	const coins = [daiToken, usdcToken, usdtToken]
	// mint token to deployer
	for (let coin of coins) {
		await coin.deployed()
		await coin
			.connect(deployer)
			.mint(deployer.address, ethers.utils.parseUnits("1000000000", 18))
	}

	await stbtToken
		.connect(deployer)
		.issue(deployer.address, ethers.utils.parseUnits("1000000000", 18), []) // 1 billion STBT

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

	await stbtToken.connect(deployer).setPermission(_3Crv.address, permission)
	await stbtToken.connect(deployer).setPermission(_3CrvPool.address, permission)

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

	await stbtToken.connect(deployer).setPermission(stbtSwapPool.address, permission)

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

	return { _3Crv, _3CrvPool, stbtSwapPool }
}

async function deployMockPriceFeedFixture(deployer) {
	const PriceFeed = await ethers.getContractFactory("MockPriceFeed")
	let priceFeed = await PriceFeed.connect(deployer).deploy()
	await priceFeed.deployed()
	return { priceFeed }
}

async function deployrUSTPoolFixture(admin, deployer, stbt, usdc) {
	const rUSTPool = await ethers.getContractFactory("rUSTPool")
	let rustpool = await rUSTPool
		.connect(deployer)
		.deploy(admin.address, stbt.address, usdc.address)
	await rustpool.deployed()
	// SET ROLE
	let POOL_MANAGER_ROLE = await rustpool.POOL_MANAGER_ROLE()
	await rustpool.connect(admin).grantRole(POOL_MANAGER_ROLE, admin.address)
	return { rustpool }
}

async function deploywSTBTPoolFixture(admin, deployer, wstbt, usdc) {
	const wSTBTPool = await ethers.getContractFactory("wSTBTPool")
	let wstbtPool = await wSTBTPool
		.connect(deployer)
		.deploy(admin.address, wstbt.address, usdc.address)
	await wstbtPool.deployed()
	// SET ROLE
	let POOL_MANAGER_ROLE = await wstbtPool.POOL_MANAGER_ROLE()
	await wstbtPool.connect(admin).grantRole(POOL_MANAGER_ROLE, admin.address)
	return { wstbtPool }
}

async function deployInterestRateModelFixture(deployer) {
	const InterestRateModel = await ethers.getContractFactory("InterestRateModel")
	let interestRateModel = await InterestRateModel.connect(deployer).deploy()
	await interestRateModel.deployed()
	return { interestRateModel }
}

async function deployLiquidatePoolFixture(
	admin,
	deployer,
	rustpool,
	mxpRedeemPool,
	stbt,
	usdc,
	priceFeed,
	coins
) {
	const LiquidatePool = await ethers.getContractFactory("LiquidatePool")
	let liquidatePool = await LiquidatePool.connect(deployer).deploy(
		admin.address,
		rustpool.address,
		mxpRedeemPool.address,
		stbt.address,
		usdc.address,
		priceFeed.address,
		coins
	)
	await liquidatePool.deployed()
	return { liquidatePool }
}

async function deployiUSTPFixture(admin, deployer, rUSTP) {
	const iUSTP = await ethers.getContractFactory("iUSTP")
	let iUSTPtoken = await iUSTP.connect(deployer).deploy(admin.address, rUSTP.address)
	await iUSTPtoken.deployed()
	return { iUSTPtoken }
}

async function deployUSTPFixture(admin, deployer, rUSTP) {
	const USTP = await ethers.getContractFactory("USTP")
	let USTPtoken = await USTP.connect(deployer).deploy(admin.address, rUSTP.address)
	await USTPtoken.deployed()
	return { USTPtoken }
}

async function deployUSTPOFTV2Fixture(deployer, rUSTP) {
	const USTP_OFTV2 = await ethers.getContractFactory("USTP_OFTV2")
	let USTP_OFTV2token = await USTP_OFTV2.connect(deployer).deploy(rUSTP.address)
	await USTP_OFTV2token.deployed()
	return { USTP_OFTV2token }
}

async function deployUSTPHelperFixture(deployer, rUSTP, iUSTP, ustp, usdctoken) {
	const USTPHelperFactory = await ethers.getContractFactory("USTPHelper")
	let USTPHelper = await USTPHelperFactory.connect(deployer).deploy(
		rUSTP.address,
		iUSTP.address,
		ustp.address,
		usdctoken.address,
		deployer.address
	)
	await USTPHelper.deployed()
	return { USTPHelper }
}

async function deployUSTPControllerFixture(deployer, admin) {
	const USTPControllerFactory = await ethers.getContractFactory("USTPController")
	let controller = await USTPControllerFactory.connect(deployer).deploy(admin.address)
	await controller.deployed()
	return { controller }
}

async function deployrUSTPVaultFixture(deployer, admin, rustp, ustp_oft) {
	const rUSTPVaultFactory = await ethers.getContractFactory("rUSTPVault")
	let rUSTPVault = await rUSTPVaultFactory
		.connect(deployer)
		.deploy(admin.address, rustp.address, ustp_oft.address)
	await rUSTPVault.deployed()
	return { rUSTPVault }
}

async function deployrUSTPRiskModelFixture(deployer, pool, base, quote) {
	const rUSTPRiskModelFactory = await ethers.getContractFactory("rUSTPRiskModel")
	let rUSTPRiskModel = await rUSTPRiskModelFactory
		.connect(deployer)
		.deploy(pool.address, base.address, quote.address)
	await rUSTPRiskModel.deployed()
	return { rUSTPRiskModel }
}

module.exports = {
	deployTokensFixture,
	deployCurvePoolFixture,
	deployMockPriceFeedFixture,
	deployrUSTPoolFixture,
	deployLiquidatePoolFixture,
	deployInterestRateModelFixture,
	deploySTBTTokensFixture,
	deployiUSTPFixture,
	deployUSTPFixture,
	deployMockTreasury,
	deployMockwTBT,
	deployMigrator,
	deployUSTPHelperFixture,
	deployMockMinter,
	deployWSTBT,
	deploywSTBTPoolFixture,
	deployUSTPOFTV2Fixture,
	deployUSTPControllerFixture,
	deployrUSTPVaultFixture,
	deployrUSTPRiskModelFixture,
}
