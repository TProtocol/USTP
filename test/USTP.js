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
	deployUSTPFixture,
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

describe("USTP", function () {
	let admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool, feeCollector
	let daiToken, usdcToken, usdtToken, stbtToken, USTPtoken
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
		;({ USTPtoken } = await deployUSTPFixture(admin, deployer, nustpool))
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

	describe("Deposit USTP", function () {
		it("Should be able to deposit", async function () {
			await nustpool.connect(usdcInvestor).approve(USTPtoken.address, amountToSupplynUSTP)
			const supplyBalance = await nustpool
				.connect(usdcInvestor)
				.balanceOf(usdcInvestor.address)

			await USTPtoken.connect(usdcInvestor).deposit(amountToSupplynUSTP)

			expect(await USTPtoken.balanceOf(usdcInvestor.address)).to.be.equal(supplyBalance)
		})

		it("Should fail if deposit zero nUSTP", async function () {
			await expect(USTPtoken.connect(stbtInvestor).deposit(0)).to.be.revertedWith(
				"can't deposit zero nUSTP"
			)
		})
	})

	describe("Withdraw USTP", function () {
		beforeEach(async () => {
			await nustpool.connect(usdcInvestor).approve(USTPtoken.address, amountToSupplynUSTP)
			await USTPtoken.connect(usdcInvestor).deposit(amountToSupplynUSTP)
		})
		it("Should be able to withdraw", async function () {
			const beforeBalance = await nustpool.balanceOf(usdcInvestor.address)
			const withdrawAmount = await USTPtoken.balanceOf(usdcInvestor.address)
			await USTPtoken.connect(usdcInvestor).withdraw(withdrawAmount)

			expect(await nustpool.balanceOf(usdcInvestor.address)).to.be.equal(
				beforeBalance.add(withdrawAmount)
			)
		})

		it("Should fail if withdraw zero nUSTP", async function () {
			await expect(USTPtoken.connect(stbtInvestor).withdraw(0)).to.be.revertedWith(
				"can't withdraw zero nUSTP"
			)
		})
	})

	describe("Claim USTP", function () {
		beforeEach(async () => {
			await nustpool.connect(usdcInvestor).approve(USTPtoken.address, amountToSupplynUSTP)
			await USTPtoken.connect(usdcInvestor).deposit(amountToSupplynUSTP)
		})
		it("Should be able to claim", async function () {
			await nustpool.connect(admin).setReserveFactor(0)
			const beforeBalance = await nustpool.balanceOf(admin.address)
			now = now + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)
			// to realize interest
			await nustpool.connect(admin).setReserveFactor(0)
			await USTPtoken.connect(admin).claimUSTP(admin.address)
			const afterBalance = await nustpool.balanceOf(admin.address)
			const claimAmount = afterBalance.sub(beforeBalance)
			// ~ 4.2%
			expect(claimAmount).to.be.within(
				amountToSupplynUSTP.mul(41).div(1000),
				amountToSupplynUSTP.mul(42).div(1000)
			)
		})
	})
})
