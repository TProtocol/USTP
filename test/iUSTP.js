const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { ethers } = require("hardhat")
const { expect } = require("chai")

const {
	deployTokensFixture,
	deployCurvePoolFixture,
	deployMockPriceFeedFixture,
	deployrUSTPoolFixture,
	deployLiquidatePoolFixture,
	deployInterestRateModelFixture,
	deploySTBTTokensFixture,
	deployiUSTPFixture,
} = require("./common/allFixture")

const ONE_HOUR = 3600
const ONE_DAY = ONE_HOUR * 24
const ONE_WEEK = ONE_DAY * 7
const ONE_MONTH = ONE_DAY * 30
const ONE_YEAR = ONE_DAY * 365

const BIGNUMBER = new ethers.BigNumber.from(2).pow(200)

const mineBlockWithTimestamp = async (provider, timestamp) => {
	await provider.send("evm_mine", [timestamp])
	return Promise.resolve()
}

describe("iUSTP", function () {
	let admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool, feeCollector
	let daiToken, usdcToken, usdtToken, stbtToken, iUSTPtoken
	let stbtSwapPool
	let priceFeed, interestRateModel
	let rustpool, liquidatePool
	let now
	let tokens

	const permission = {
		sendAllowed: true,
		receiveAllowed: true,
		expiryTime: 0,
	}
	const amountToSupplyUSDC = ethers.utils.parseUnits("100", 6) // 100 USDC
	const amountToSupplySTBT = ethers.utils.parseUnits("100", 18) // 100 STBT
	const amountToBorrowUSDC = ethers.utils.parseUnits("98", 6) // 98 USDC
	const amountToSupplyrUSTP = ethers.utils.parseUnits("100", 18) // 100 rUSTP

	beforeEach("load fixture", async () => {
		;[admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool, feeCollector] =
			await ethers.getSigners()
		// deploy tokens
		;({ daiToken, usdcToken, usdtToken } = await deployTokensFixture(
			deployer,
			usdcInvestor,
			stbtInvestor
		))
		;({ stbtToken } = await deploySTBTTokensFixture(deployer, usdcInvestor, stbtInvestor))
		;({ _, _, stbtSwapPool } = await deployCurvePoolFixture(
			deployer,
			daiToken,
			usdcToken,
			usdtToken,
			stbtToken
		))
		;({ priceFeed } = await deployMockPriceFeedFixture(deployer))
		;({ rustpool } = await deployrUSTPoolFixture(admin, deployer, stbtToken, usdcToken))
		;({ liquidatePool } = await deployLiquidatePoolFixture(
			admin,
			deployer,
			rustpool,
			mxpRedeemPool,
			stbtToken,
			usdcToken,
			priceFeed,
			[daiToken.address, usdcToken.address, usdtToken.address]
		))
		;({ interestRateModel } = await deployInterestRateModelFixture(deployer))
		;({ iUSTPtoken } = await deployiUSTPFixture(admin, deployer, rustpool))
		await liquidatePool.connect(admin).setCurvePool(stbtSwapPool.address)
		await liquidatePool.connect(admin).setRedeemPool(mxpRedeemPool.address)
		await rustpool.connect(admin).initLiquidatePool(liquidatePool.address)
		await rustpool.connect(admin).setInterestRateModel(interestRateModel.address)

		await stbtToken.connect(deployer).setPermission(mxpRedeemPool.address, permission)
		await stbtToken.connect(deployer).setPermission(liquidatePool.address, permission)
		await stbtToken.connect(deployer).setPermission(rustpool.address, permission)

		await liquidatePool.connect(admin).setFeeCollector(feeCollector.address)

		now = (await ethers.provider.getBlock("latest")).timestamp

		tokens = [daiToken, usdcToken, usdtToken]

		await usdcToken.connect(usdcInvestor).approve(rustpool.address, amountToSupplyUSDC)
		await rustpool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
		await stbtToken.connect(stbtInvestor).approve(rustpool.address, amountToSupplySTBT)
		await rustpool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT)

		await rustpool.connect(stbtInvestor).borrowUSDC(amountToBorrowUSDC)
	})

	describe("Wrap iUSTP", function () {
		it("Should be able to wrap", async function () {
			await rustpool.connect(usdcInvestor).approve(iUSTPtoken.address, amountToSupplyrUSTP)
			const supplyShares = await rustpool.connect(usdcInvestor).sharesOf(usdcInvestor.address)

			await iUSTPtoken.connect(usdcInvestor).wrap(amountToSupplyrUSTP)

			expect(await iUSTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(supplyShares)
		})

		it("Should fail if wrap zero rUSTP", async function () {
			await expect(iUSTPtoken.connect(stbtInvestor).wrap(0)).to.be.revertedWith(
				"can't wrap zero rUSTP"
			)
		})
	})

	describe("Unwrap iUSTP", function () {
		beforeEach(async () => {
			await rustpool.connect(usdcInvestor).approve(iUSTPtoken.address, amountToSupplyrUSTP)
			await iUSTPtoken.connect(usdcInvestor).wrap(amountToSupplyrUSTP)
		})
		it("Should be able to unwrap", async function () {
			const beforeShares = await rustpool.sharesOf(usdcInvestor.address)
			const unwrapAmount = await iUSTPtoken.balanceOf(usdcInvestor.address)
			await iUSTPtoken.connect(usdcInvestor).unwrap(unwrapAmount)

			expect(await rustpool.sharesOf(usdcInvestor.address)).to.be.equal(
				beforeShares.add(unwrapAmount)
			)
		})

		it("Should fail if unwrap zero rUSTP", async function () {
			await expect(iUSTPtoken.connect(stbtInvestor).unwrap(0)).to.be.revertedWith(
				"can't unwrap zero rUSTP"
			)
		})
	})

	describe("Token Price", function () {
		beforeEach(async () => {
			await rustpool.connect(usdcInvestor).approve(iUSTPtoken.address, amountToSupplyrUSTP)
			await iUSTPtoken.connect(usdcInvestor).wrap(amountToSupplyrUSTP)
		})
		it("Token price should be increase", async function () {
			await rustpool.connect(admin).setReserveFactor(0)
			const beforePrice = await iUSTPtoken.pricePerToken()
			now = now + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)
			// to realize interest
			await rustpool.connect(admin).setReserveFactor(0)
			const afterPrice = await iUSTPtoken.pricePerToken()

			expect(afterPrice).to.be.gte(beforePrice.mul(104).div(100))
		})
	})
})
