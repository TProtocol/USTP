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

	describe("Warp iUSTP", function () {
		it("Should be able to warp", async function () {
			await rustpool.connect(usdcInvestor).approve(iUSTPtoken.address, amountToSupplyrUSTP)
			const supplyShares = await rustpool.connect(usdcInvestor).sharesOf(usdcInvestor.address)

			await iUSTPtoken.connect(usdcInvestor).warp(amountToSupplyrUSTP)

			expect(await iUSTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(supplyShares)
		})

		it("Should fail if warp zero rUSTP", async function () {
			await expect(iUSTPtoken.connect(stbtInvestor).warp(0)).to.be.revertedWith(
				"can't warp zero rUSTP"
			)
		})
	})

	describe("Unwarp iUSTP", function () {
		beforeEach(async () => {
			await rustpool.connect(usdcInvestor).approve(iUSTPtoken.address, amountToSupplyrUSTP)
			await iUSTPtoken.connect(usdcInvestor).warp(amountToSupplyrUSTP)
		})
		it("Should be able to unwarp", async function () {
			const beforeShares = await rustpool.sharesOf(usdcInvestor.address)
			const unwarpAmount = await iUSTPtoken.balanceOf(usdcInvestor.address)
			await iUSTPtoken.connect(usdcInvestor).unwarp(unwarpAmount)

			expect(await rustpool.sharesOf(usdcInvestor.address)).to.be.equal(
				beforeShares.add(unwarpAmount)
			)
		})

		it("Should fail if unwarp zero rUSTP", async function () {
			await expect(iUSTPtoken.connect(stbtInvestor).unwarp(0)).to.be.revertedWith(
				"can't unwarp zero rUSTP"
			)
		})
	})

	describe("Token Price", function () {
		beforeEach(async () => {
			await rustpool.connect(usdcInvestor).approve(iUSTPtoken.address, amountToSupplyrUSTP)
			await iUSTPtoken.connect(usdcInvestor).warp(amountToSupplyrUSTP)
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
