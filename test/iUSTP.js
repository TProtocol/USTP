const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { ethers } = require("hardhat")
const { expect } = require("chai")

const {
	deployTokensFixture,
	deployCurvePoolFixture,
	deployMockPriceFeedFixture,
	deploynUSTPoolFixture,
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
	let nustpool, liquidatePool
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
	const amountToSupplynUSTP = ethers.utils.parseUnits("100", 18) // 100 nUSTP

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
		;({ nustpool } = await deploynUSTPoolFixture(admin, deployer, stbtToken, usdcToken))
		;({ liquidatePool } = await deployLiquidatePoolFixture(
			admin,
			deployer,
			nustpool,
			mxpRedeemPool,
			stbtToken,
			usdcToken,
			priceFeed,
			[daiToken.address, usdcToken.address, usdtToken.address]
		))
		;({ interestRateModel } = await deployInterestRateModelFixture(deployer))
		;({ iUSTPtoken } = await deployiUSTPFixture(admin, deployer, nustpool))
		await liquidatePool.connect(admin).setCurvePool(stbtSwapPool.address)
		await liquidatePool.connect(admin).setRedeemPool(mxpRedeemPool.address)
		await nustpool.connect(admin).initLiquidatePool(liquidatePool.address)
		await nustpool.connect(admin).setInterestRateModel(interestRateModel.address)

		await stbtToken.connect(deployer).setPermission(mxpRedeemPool.address, permission)
		await stbtToken.connect(deployer).setPermission(liquidatePool.address, permission)
		await stbtToken.connect(deployer).setPermission(nustpool.address, permission)

		await liquidatePool.connect(admin).setFeeCollector(feeCollector.address)

		now = (await ethers.provider.getBlock("latest")).timestamp

		tokens = [daiToken, usdcToken, usdtToken]

		await usdcToken.connect(usdcInvestor).approve(nustpool.address, amountToSupplyUSDC)
		await nustpool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
		await stbtToken.connect(stbtInvestor).approve(nustpool.address, amountToSupplySTBT)
		await nustpool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT)

		await nustpool.connect(stbtInvestor).borrowUSDC(amountToBorrowUSDC)
	})

	describe("Warp iUSTP", function () {
		it("Should be able to warp", async function () {
			await nustpool.connect(usdcInvestor).approve(iUSTPtoken.address, amountToSupplynUSTP)
			const supplyShares = await nustpool.connect(usdcInvestor).sharesOf(usdcInvestor.address)

			await iUSTPtoken.connect(usdcInvestor).warp(amountToSupplynUSTP)

			expect(await iUSTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(supplyShares)
		})

		it("Should fail if warp zero nUSTP", async function () {
			await expect(iUSTPtoken.connect(stbtInvestor).warp(0)).to.be.revertedWith(
				"can't warp zero nUSTP"
			)
		})
	})

	describe("Unwarp iUSTP", function () {
		beforeEach(async () => {
			await nustpool.connect(usdcInvestor).approve(iUSTPtoken.address, amountToSupplynUSTP)
			await iUSTPtoken.connect(usdcInvestor).warp(amountToSupplynUSTP)
		})
		it("Should be able to unwarp", async function () {
			const beforeShares = await nustpool.sharesOf(usdcInvestor.address)
			const unwarpAmount = await iUSTPtoken.balanceOf(usdcInvestor.address)
			await iUSTPtoken.connect(usdcInvestor).unwarp(unwarpAmount)

			expect(await nustpool.sharesOf(usdcInvestor.address)).to.be.equal(
				beforeShares.add(unwarpAmount)
			)
		})

		it("Should fail if unwarp zero nUSTP", async function () {
			await expect(iUSTPtoken.connect(stbtInvestor).unwarp(0)).to.be.revertedWith(
				"can't unwarp zero nUSTP"
			)
		})
	})

	describe("Token Price", function () {
		beforeEach(async () => {
			await nustpool.connect(usdcInvestor).approve(iUSTPtoken.address, amountToSupplynUSTP)
			await iUSTPtoken.connect(usdcInvestor).warp(amountToSupplynUSTP)
		})
		it("Token price should be increase", async function () {
			await nustpool.connect(admin).setReserveFactor(0)
			const beforePrice = await iUSTPtoken.pricePerToken()
			now = now + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)
			// to realize interest
			await nustpool.connect(admin).setReserveFactor(0)
			const afterPrice = await iUSTPtoken.pricePerToken()

			expect(afterPrice).to.be.gte(beforePrice.mul(104).div(100))
		})
	})
})
