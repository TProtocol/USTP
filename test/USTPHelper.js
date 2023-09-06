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
	deployUSTPFixture,
	deployiUSTPFixture,
	deployUSTPHelperFixture,
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

describe("USTPHelper", function () {
	let admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool, feeCollector
	let daiToken, usdcToken, usdtToken, stbtToken, USTPtoken, iUSTPtoken
	let stbtSwapPool
	let priceFeed, interestRateModel
	let rustpool, liquidatePool
	let now
	let USTPHelper

	const permission = {
		sendAllowed: true,
		receiveAllowed: true,
		expiryTime: 0,
	}
	const amountToSupplyUSDC = ethers.utils.parseUnits("100", 6) // 100 USDC
	const amountUSTP = ethers.utils.parseUnits("100", 18) // 100 USDC
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
		;({ USTPtoken } = await deployUSTPFixture(admin, deployer, rustpool))
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
		;({ USTPHelper } = await deployUSTPHelperFixture(
			deployer,
			rustpool,
			iUSTPtoken,
			USTPtoken,
			usdcToken
		))
	})

	describe("Mint rUSTP", function () {
		beforeEach(async () => {
			await usdcToken.connect(usdcInvestor).approve(USTPHelper.address, amountToSupplyUSDC)
		})
		it("Should be able to mint", async function () {
			await USTPHelper.connect(usdcInvestor).mintrUSTP(amountToSupplyUSDC)
			expect(await rustpool.balanceOf(usdcInvestor.address)).to.be.equal(amountUSTP)
		})
	})

	describe("Mint iUSTP", function () {
		beforeEach(async () => {
			await usdcToken.connect(usdcInvestor).approve(USTPHelper.address, amountToSupplyUSDC)
		})
		it("Should be able to mint", async function () {
			await USTPHelper.connect(usdcInvestor).mintiUSTP(amountToSupplyUSDC)
			expect(await iUSTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(amountUSTP)
		})

		it("Should be able to mint by USTP", async function () {
			await USTPHelper.connect(usdcInvestor).mintUSTP(amountToSupplyUSDC)
			expect(await USTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(amountUSTP)

			await USTPtoken.connect(usdcInvestor).approve(USTPHelper.address, amountUSTP)
			await USTPHelper.connect(usdcInvestor).wrapUSTPToiUSTP(amountUSTP)
			expect(await iUSTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(amountUSTP)
		})
	})

	describe("Mint USTP", function () {
		beforeEach(async () => {
			await usdcToken.connect(usdcInvestor).approve(USTPHelper.address, amountToSupplyUSDC)
		})
		it("Should be able to mint", async function () {
			await USTPHelper.connect(usdcInvestor).mintUSTP(amountToSupplyUSDC)
			expect(await USTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(amountUSTP)
		})
		it("Should be able to mint by iUSTP", async function () {
			await USTPHelper.connect(usdcInvestor).mintiUSTP(amountToSupplyUSDC)
			expect(await iUSTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(amountUSTP)

			await iUSTPtoken.connect(usdcInvestor).approve(USTPHelper.address, amountUSTP)
			await USTPHelper.connect(usdcInvestor).wrapiUSTPToUSTP(amountUSTP)
			expect(await USTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(amountUSTP)
		})

		it("Should be able to mint by rUSTP", async function () {
			await USTPHelper.connect(usdcInvestor).mintrUSTP(amountToSupplyUSDC)
			expect(await rustpool.balanceOf(usdcInvestor.address)).to.be.equal(amountUSTP)

			await rustpool.connect(usdcInvestor).approve(USTPHelper.address, amountUSTP)
			await USTPHelper.connect(usdcInvestor).wraprUSTPToUSTP(amountUSTP)
			expect(await USTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(amountUSTP)
		})
	})
})
