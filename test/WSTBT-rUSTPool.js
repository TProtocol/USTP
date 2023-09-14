const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { ethers } = require("hardhat")
const { expect } = require("chai")

const {
	deployTokensFixture,
	deployCurvePoolFixture,
	deployMockPriceFeedFixture,
	deploywSTBTPoolFixture,
	deployLiquidatePoolFixture,
	deployInterestRateModelFixture,
	deploySTBTTokensFixture,
	deployMockMinter,
	deployWSTBT,
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

describe("WSTBT-rUSTPool", function () {
	let admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool, feeCollector
	let daiToken, usdcToken, usdtToken, stbtToken, wstbtToken
	let stbtSwapPool
	let priceFeed, interestRateModel
	let wstbtPool, liquidatePool
	let now
	let tokens
	let mockMinter

	const permission = {
		sendAllowed: true,
		receiveAllowed: true,
		expiryTime: 0,
	}

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
		;({ wstbtToken } = await deployWSTBT(deployer, stbtToken))
		;({ _, _, stbtSwapPool } = await deployCurvePoolFixture(
			deployer,
			daiToken,
			usdcToken,
			usdtToken,
			stbtToken
		))
		;({ priceFeed } = await deployMockPriceFeedFixture(deployer))
		;({ mockMinter } = await deployMockMinter(deployer, stbtToken, mxpRedeemPool))
		;({ wstbtPool } = await deploywSTBTPoolFixture(admin, deployer, wstbtToken, usdcToken))
		;({ liquidatePool } = await deployLiquidatePoolFixture(
			admin,
			deployer,
			wstbtPool,
			mxpRedeemPool,
			wstbtToken,
			usdcToken,
			priceFeed,
			[daiToken.address, usdcToken.address, usdtToken.address]
		))
		;({ interestRateModel } = await deployInterestRateModelFixture(deployer))

		await liquidatePool.connect(admin).setCurvePool(stbtSwapPool.address)
		await liquidatePool.connect(admin).setRedeemPool(mxpRedeemPool.address)
		await liquidatePool.connect(admin).setSTBTMinter(mockMinter.address)
		// must be less than 1.005 USD
		await liquidatePool.connect(admin).setPegPrice(99500000, 100500000)
		await wstbtPool.connect(admin).initLiquidatePool(liquidatePool.address)
		await wstbtPool.connect(admin).setInterestRateModel(interestRateModel.address)

		await stbtToken.connect(deployer).setPermission(mxpRedeemPool.address, permission)
		await stbtToken.connect(deployer).setPermission(liquidatePool.address, permission)
		await stbtToken.connect(deployer).setPermission(wstbtPool.address, permission)
		await stbtToken.connect(deployer).setPermission(wstbtPool.address, permission)

		await liquidatePool.connect(admin).setFeeCollector(feeCollector.address)

		await stbtToken
			.connect(stbtInvestor)
			.approve(wstbtToken.address, ethers.utils.parseUnits("100000000", 18))
		await wstbtToken.connect(stbtInvestor).wrap(ethers.utils.parseUnits("100000000", 18))

		now = (await ethers.provider.getBlock("latest")).timestamp

		tokens = [daiToken, usdcToken, usdtToken]
	})
	const amountToSupplyUSDC = ethers.utils.parseUnits("100", 6) // 100 USDC
	const amountToSupplySTBT = ethers.utils.parseUnits("100", 18) // 100 STBT
	const amountToBorrowUSDC = ethers.utils.parseUnits("98", 6) // 98 USDC
	describe("Supply", function () {
		describe("Supply USDC", function () {
			it("Should be able to supply", async function () {
				await usdcToken.connect(usdcInvestor).approve(wstbtPool.address, amountToSupplyUSDC)
				await wstbtPool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
				expect(await wstbtPool.balanceOf(usdcInvestor.address)).to.be.equal(
					ethers.utils.parseUnits("100", 18)
				)
			})

			it("Should fail if supply zero USDC", async function () {
				await expect(wstbtPool.connect(usdcInvestor).supplyUSDC(0)).to.be.revertedWith(
					"Supply USDC should more then 0."
				)
			})
		})
		describe("Supply STBT", function () {
			it("Should be able to supply", async function () {
				await wstbtToken
					.connect(stbtInvestor)
					.approve(wstbtPool.address, amountToSupplySTBT)

				await wstbtPool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT)

				expect(await wstbtPool.depositedAmountWSTBT(stbtInvestor.address)).to.be.equal(
					amountToSupplySTBT
				)
			})

			it("Should fail if supply zero STBT", async function () {
				await expect(wstbtPool.connect(stbtInvestor).supplySTBT(0)).to.be.revertedWith(
					"Supply STBT should more then 0."
				)
			})
		})
	})

	describe("Withdraw", function () {
		beforeEach(async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			await usdcToken.connect(usdcInvestor).approve(wstbtPool.address, amountToSupplyUSDC)
			await wstbtPool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
			await wstbtToken.connect(stbtInvestor).approve(wstbtPool.address, amountToSupplySTBT)
			await wstbtPool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT)
		})
		describe("Withdraw USDC", function () {
			it("Should be able to withdraw", async function () {
				const usdcAmountBefore = await usdcToken.balanceOf(usdcInvestor.address)

				const rustpAmount = await wstbtPool.balanceOf(usdcInvestor.address)
				await wstbtPool.connect(usdcInvestor).withdrawUSDC(amountToSupplyUSDC)

				const usdcAmountAfter = await usdcToken.balanceOf(usdcInvestor.address)

				expect(await wstbtPool.balanceOf(usdcInvestor.address)).to.be.equal(0)
				expect(usdcAmountAfter).to.be.equal(rustpAmount.div(1e12).add(usdcAmountBefore))
			})

			it("Should be able to withdraw all usdc", async function () {
				await wstbtPool.connect(stbtInvestor).borrowUSDC(amountToBorrowUSDC)
				now = now + ONE_YEAR
				await mineBlockWithTimestamp(ethers.provider, now)

				// to realize interest
				await wstbtPool.connect(admin).setReserveFactor(0)

				// add interest
				await usdcToken
					.connect(deployer)
					.transfer(wstbtPool.address, amountToBorrowUSDC.mul(2))

				const usdcAmountBefore = await usdcToken.balanceOf(usdcInvestor.address)

				const rustpAmount = await wstbtPool.balanceOf(usdcInvestor.address)
				await wstbtPool.connect(usdcInvestor).withdrawAllUSDC()

				const usdcAmountAfter = await usdcToken.balanceOf(usdcInvestor.address)

				expect(await wstbtPool.balanceOf(usdcInvestor.address)).to.be.equal(0)
				expect(usdcAmountAfter).to.be.equal(rustpAmount.div(1e12).add(usdcAmountBefore))
			})

			it("Should fail if withdraw zero USDC", async function () {
				await expect(wstbtPool.connect(usdcInvestor).withdrawUSDC(0)).to.be.revertedWith(
					"Withdraw USDC should more then 0."
				)
			})

			it("Should fail if withdraw more than supply", async function () {
				await expect(
					wstbtPool.connect(usdcInvestor).withdrawUSDC(amountToSupplyUSDC + 1)
				).to.be.revertedWith("BALANCE_EXCEEDED")
			})
		})
		describe("Withdraw STBT", function () {
			it("Should be able to withdraw", async function () {
				const wstbtAmountBefore = await wstbtToken.balanceOf(stbtInvestor.address)
				await wstbtPool.connect(stbtInvestor).withdrawSTBT(amountToSupplySTBT)

				const wstbtAmountAfter = await wstbtToken.balanceOf(stbtInvestor.address)

				expect(await wstbtPool.depositedAmountWSTBT(stbtInvestor.address)).to.be.equal(0)
				expect(wstbtAmountAfter).to.be.equal(amountToSupplySTBT.add(wstbtAmountBefore))
			})

			it("Should be able to withdraw all stbt", async function () {
				const wstbtAmountBefore = await wstbtToken.balanceOf(stbtInvestor.address)
				await wstbtPool.connect(stbtInvestor).withdrawAllSTBT()

				const wstbtAmountAfter = await wstbtToken.balanceOf(stbtInvestor.address)

				expect(await wstbtPool.depositedAmountWSTBT(stbtInvestor.address)).to.be.equal(0)
				expect(wstbtAmountAfter).to.be.equal(amountToSupplySTBT.add(wstbtAmountBefore))
			})

			it("Should fail if supply zero STBT", async function () {
				await expect(wstbtPool.connect(stbtInvestor).withdrawSTBT(0)).to.be.revertedWith(
					"Withdraw STBT should more then 0."
				)
			})

			it("Should fail if withdraw more than supply", async function () {
				await expect(wstbtPool.connect(stbtInvestor).withdrawSTBT(amountToSupplySTBT + 1))
					.to.be.reverted
			})
		})
	})
	describe("Borrow", function () {
		beforeEach(async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			await usdcToken.connect(usdcInvestor).approve(wstbtPool.address, amountToSupplyUSDC)
			await wstbtPool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
			await wstbtToken.connect(stbtInvestor).approve(wstbtPool.address, amountToSupplySTBT)
			await wstbtPool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT)
		})
		describe("Borrow USDC", function () {
			it("Should be able to borrow", async function () {
				const usdcAmountBefore = await usdcToken.balanceOf(stbtInvestor.address)

				const borrowShares = await wstbtPool.getSharesByrUSTPAmount(
					amountToBorrowUSDC.mul(1e12)
				)
				await wstbtPool.connect(stbtInvestor).borrowUSDC(amountToBorrowUSDC)

				const usdcAmountAfter = await usdcToken.balanceOf(stbtInvestor.address)

				expect(await wstbtPool.getBorrowedSharesOf(stbtInvestor.address)).to.be.equal(
					borrowShares
				)
				expect(await wstbtPool.totalBorrowShares()).to.be.equal(borrowShares)
				expect(usdcAmountAfter).to.be.equal(amountToBorrowUSDC.add(usdcAmountBefore))
			})

			it("Should be able to borrow more when STBT distribute", async function () {
				const usdcAmountBefore = await usdcToken.balanceOf(stbtInvestor.address)

				const doubleBorrow = amountToBorrowUSDC.mul(2)
				await usdcToken.connect(usdcInvestor).approve(wstbtPool.address, amountToSupplyUSDC)
				await wstbtPool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
				const totalSupplySTBT = await stbtToken.totalSupply()
				await stbtToken.connect(deployer).distributeInterests(totalSupplySTBT, now, now + 1)

				const borrowShares = await wstbtPool.getSharesByrUSTPAmount(doubleBorrow.mul(1e12))
				await wstbtPool.connect(stbtInvestor).borrowUSDC(doubleBorrow)

				const usdcAmountAfter = await usdcToken.balanceOf(stbtInvestor.address)

				expect(await wstbtPool.getBorrowedSharesOf(stbtInvestor.address)).to.be.equal(
					borrowShares
				)
				expect(await wstbtPool.totalBorrowShares()).to.be.equal(borrowShares)
				expect(usdcAmountAfter).to.be.equal(doubleBorrow.add(usdcAmountBefore))
			})

			it("Should fail if borrow zero USDC", async function () {
				await expect(wstbtPool.connect(stbtInvestor).borrowUSDC(0)).to.be.revertedWith(
					"Borrow USDC should more then 0."
				)
			})

			it("Should fail if borrow more than collateral", async function () {
				await expect(
					wstbtPool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC)
				).to.be.revertedWith("Cannot be lower than the safeCollateralRate.")
			})
		})
	})

	describe("Repay", function () {
		beforeEach(async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			// await interestRateModel.connect(deployer).setAPR(0)
			await usdcToken.connect(usdcInvestor).approve(wstbtPool.address, amountToSupplyUSDC)
			await wstbtPool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
			await wstbtToken.connect(stbtInvestor).approve(wstbtPool.address, amountToSupplySTBT)
			await wstbtPool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT)

			await wstbtPool.connect(stbtInvestor).borrowUSDC(amountToBorrowUSDC)
			await usdcToken.connect(stbtInvestor).approve(wstbtPool.address, BIGNUMBER)
			now = now + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)
			// to realize interest
			await wstbtPool.connect(admin).setReserveFactor(0)
			await interestRateModel.connect(deployer).setAPR(0)
		})
		describe("Repay USDC", function () {
			it("Should be able to repay 50%", async function () {
				const usdcAmountBefore = await usdcToken.balanceOf(stbtInvestor.address)

				const borrowSharesBefore = await wstbtPool.getBorrowedSharesOf(stbtInvestor.address)
				const borrowiUSDP = (await wstbtPool.getBorrowedAmount(stbtInvestor.address)).div(2)

				const borrowUSDC = borrowiUSDP.div(1e12)

				const repayShares = await wstbtPool.getBorrowSharesByrUSTPAmount(borrowiUSDP)

				await wstbtPool.connect(stbtInvestor).repayUSDC(borrowUSDC)

				const usdcAmountAfter = await usdcToken.balanceOf(stbtInvestor.address)
				const borrowSharesAfter = await wstbtPool.getBorrowedSharesOf(stbtInvestor.address)

				expect(borrowSharesAfter).to.be.within(
					borrowSharesBefore.sub(repayShares),
					borrowSharesBefore.sub(repayShares).add(1e12)
				)
				expect(await wstbtPool.totalBorrowShares()).to.be.equal(borrowSharesAfter)
				expect(usdcAmountBefore).to.be.equal(usdcAmountAfter.add(borrowUSDC))
			})
			it("Should be able to repay 100%", async function () {
				const usdcAmountBefore = await usdcToken.balanceOf(stbtInvestor.address)

				const borrowSharesBefore = await wstbtPool.getBorrowedSharesOf(stbtInvestor.address)
				const borrowiUSDP = await wstbtPool.getBorrowedAmount(stbtInvestor.address)

				const borrowUSDC = borrowiUSDP.div(1e12)

				const repayShares = await wstbtPool.getBorrowSharesByrUSTPAmount(borrowiUSDP)

				await wstbtPool.connect(stbtInvestor).repayUSDC(borrowUSDC)

				const usdcAmountAfter = await usdcToken.balanceOf(stbtInvestor.address)
				const borrowSharesAfter = await wstbtPool.getBorrowedSharesOf(stbtInvestor.address)

				expect(borrowSharesAfter).to.be.within(
					borrowSharesBefore.sub(repayShares),
					borrowSharesBefore.sub(repayShares).add(1e12)
				)
				expect(await wstbtPool.totalBorrowShares()).to.be.equal(borrowSharesAfter)
				expect(usdcAmountBefore).to.be.equal(usdcAmountAfter.add(borrowUSDC))
			})

			it("Should be able to repay 100% and user could with all usdc", async function () {
				const usdcAmountBefore = await usdcToken.balanceOf(stbtInvestor.address)
				const borrowiUSDP = await wstbtPool.getBorrowedAmount(stbtInvestor.address)
				const borrowUSDC = borrowiUSDP.div(1e12)
				await wstbtPool.connect(stbtInvestor).repayAll()
				const usdcAmountAfter = await usdcToken.balanceOf(stbtInvestor.address)
				// at repayAll function, the repay usdc should be add 1.
				expect(usdcAmountBefore).to.be.equal(usdcAmountAfter.add(borrowUSDC).add(1))
				const interestUSDC = borrowUSDC.sub(amountToBorrowUSDC)

				const balanceOfUserBefore = await usdcToken.balanceOf(usdcInvestor.address)
				await wstbtPool.connect(usdcInvestor).withdrawAllUSDC()

				const balanceOfUserAfter = await usdcToken.balanceOf(usdcInvestor.address)
				expect(balanceOfUserAfter).to.be.equal(
					balanceOfUserBefore.add(amountToSupplyUSDC).add(interestUSDC)
				)
			})
			it("Should fail if repay zero USDC", async function () {
				await expect(wstbtPool.connect(stbtInvestor).repayUSDC(0)).to.be.revertedWith(
					"Repay USDC should more then 0."
				)
			})
		})
	})

	describe("Interest", function () {
		beforeEach(async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			await usdcToken.connect(usdcInvestor).approve(wstbtPool.address, amountToSupplyUSDC)
			await wstbtPool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
			await wstbtToken
				.connect(stbtInvestor)
				.approve(wstbtPool.address, amountToSupplySTBT.mul(2))
			await wstbtPool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT.mul(2))
		})
		describe("Gain interest", function () {
			it("Should be able to full interest when 100% utilization rate", async function () {
				// borrow all usdc
				await wstbtPool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC)
				now = now + ONE_YEAR
				await mineBlockWithTimestamp(ethers.provider, now)

				// to realize interest
				await wstbtPool.connect(admin).setReserveFactor(0)

				const rustpAmount = await wstbtPool.balanceOf(usdcInvestor.address)

				// ~= 5.2% apr
				expect(rustpAmount.div(1e12)).to.be.within(
					amountToSupplyUSDC.mul(10510).div(10000),
					amountToSupplyUSDC.mul(10530).div(10000)
				)
			})
			it("Should be able to half interest when 50% utilization rate", async function () {
				// borrow all usdc
				await wstbtPool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC.div(2))
				now = now + ONE_YEAR
				await mineBlockWithTimestamp(ethers.provider, now)

				// to realize interest
				await wstbtPool.connect(admin).setReserveFactor(0)

				const rustpAmount = await wstbtPool.balanceOf(usdcInvestor.address)

				// ~= 2.1% apr
				expect(rustpAmount.div(1e12)).to.be.within(
					amountToSupplyUSDC.mul(10255).div(10000),
					amountToSupplyUSDC.mul(10265).div(10000)
				)
			})

			it("Should be able to withdraw interest income", async function () {
				// borrow all usdc
				await wstbtPool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC)
				now = now + ONE_YEAR
				await mineBlockWithTimestamp(ethers.provider, now)

				// to realize interest
				await wstbtPool.connect(admin).setReserveFactor(0)

				await usdcToken
					.connect(stbtInvestor)
					.approve(wstbtPool.address, amountToSupplyUSDC.mul(2))
				await wstbtPool.connect(stbtInvestor).supplyUSDC(amountToSupplyUSDC.mul(2))

				const usdcAmountBefore = await usdcToken.balanceOf(usdcInvestor.address)

				const rustpAmount = await wstbtPool.balanceOf(usdcInvestor.address)
				await wstbtPool.connect(usdcInvestor).withdrawUSDC(rustpAmount.div(1e12))

				const usdcAmountAfter = await usdcToken.balanceOf(usdcInvestor.address)

				expect(usdcAmountAfter).to.be.equal(rustpAmount.div(1e12).add(usdcAmountBefore))
			})
			it("Should be able to get reserve fee", async function () {
				// set reserve 10%
				await wstbtPool.connect(admin).setReserveFactor(1000000)
				// borrow all usdc
				await wstbtPool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC)
				now = now + ONE_YEAR
				await mineBlockWithTimestamp(ethers.provider, now)

				// to realize interest
				await wstbtPool.connect(admin).setReserveFactor(0)

				await wstbtPool.connect(admin).claimReservesFee(feeCollector.address)
				const feeBalance = await wstbtPool.balanceOf(feeCollector.address)
				const rustpAmount = await wstbtPool.balanceOf(usdcInvestor.address)
				// ~= 5.2% apr
				expect(rustpAmount.add(feeBalance).div(1e12)).to.be.within(
					amountToSupplyUSDC.mul(10510).div(10000),
					amountToSupplyUSDC.mul(10530).div(10000)
				)
			})
			it("Should be able the same debt and ustp supply when 100% utilization rate", async function () {
				const oldTotalSupplyrUSTP = await wstbtPool.totalSupplyrUSTP()
				// borrow all usdc
				await wstbtPool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC)
				now = now + ONE_YEAR
				await mineBlockWithTimestamp(ethers.provider, now)

				// to realize interest
				await wstbtPool.connect(admin).setReserveFactor(0)
				const newTotalSupplyrUSTP = await wstbtPool.totalSupplyrUSTP()
				const totalBorrowrUSTP = await wstbtPool.totalBorrowrUSTP()

				const rustpAmount = await wstbtPool.balanceOf(usdcInvestor.address)

				// ~= 5.2% apr
				expect(rustpAmount.div(1e12)).to.be.within(
					amountToSupplyUSDC.mul(10510).div(10000),
					amountToSupplyUSDC.mul(10530).div(10000)
				)

				expect(totalBorrowrUSTP.sub(amountToSupplyUSDC.mul(1e12))).to.be.equal(
					newTotalSupplyrUSTP.sub(oldTotalSupplyrUSTP)
				)
			})

			it("Should be able the same debt and ustp supply when 50% utilization rate", async function () {
				const oldTotalSupplyrUSTP = await wstbtPool.totalSupplyrUSTP()
				// borrow 50% usdc
				await wstbtPool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC.div(2))
				now = now + ONE_YEAR
				await mineBlockWithTimestamp(ethers.provider, now)

				// to realize interest
				await wstbtPool.connect(admin).setReserveFactor(0)
				const newTotalSupplyrUSTP = await wstbtPool.totalSupplyrUSTP()
				const totalBorrowrUSTP = await wstbtPool.totalBorrowrUSTP()

				const rustpAmount = await wstbtPool.balanceOf(usdcInvestor.address)

				// ~= 2.1% apr
				expect(rustpAmount.div(1e12)).to.be.within(
					amountToSupplyUSDC.mul(10255).div(10000),
					amountToSupplyUSDC.mul(10265).div(10000)
				)

				expect(totalBorrowrUSTP.sub(amountToSupplyUSDC.div(2).mul(1e12))).to.be.equal(
					newTotalSupplyrUSTP.sub(oldTotalSupplyrUSTP)
				)
			})
		})
	})

	describe("Liquidate", function () {
		beforeEach(async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			await usdcToken
				.connect(usdcInvestor)
				.approve(wstbtPool.address, amountToSupplyUSDC.mul(10))
			await wstbtPool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC.mul(10))
			await wstbtToken
				.connect(stbtInvestor)
				.approve(wstbtPool.address, amountToSupplySTBT.mul(2))
			await wstbtPool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT.mul(2))
			await wstbtPool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC)
			await wstbtPool.connect(admin).setLiquidateProvider(stbtInvestor.address, true)
			await liquidatePool.connect(admin).setRedemptionOption(true)
		})

		it(`Should be able to liquidate for with zero fee`, async () => {
			const liquidateSTBT = amountToSupplyUSDC.mul(1e12)
			const beforeUSDPAmount = await wstbtPool.balanceOf(usdcInvestor.address)
			await wstbtPool
				.connect(usdcInvestor)
				.liquidateBorrow(stbtInvestor.address, liquidateSTBT)
			const afterUSDPAmount = await wstbtPool.balanceOf(usdcInvestor.address)
			// There are some err in interest.
			expect(beforeUSDPAmount.sub(afterUSDPAmount)).to.be.within(
				liquidateSTBT.mul(99999).div(100000),
				liquidateSTBT.mul(100001).div(100000)
			)

			const mxpBalance = await wstbtToken.balanceOf(mxpRedeemPool.address)
			expect(mxpBalance).to.be.equal(liquidateSTBT)

			const liquidationIndex = await liquidatePool.liquidationIndex()
			await usdcToken.connect(deployer).transfer(liquidatePool.address, amountToSupplyUSDC)
			const beforeUSDCAmount = await usdcToken.balanceOf(usdcInvestor.address)
			await liquidatePool.connect(usdcInvestor).finalizeLiquidationById(liquidationIndex)
			const afterUSDCAmount = await usdcToken.balanceOf(usdcInvestor.address)
			expect(afterUSDCAmount.sub(beforeUSDCAmount)).to.be.equal(amountToSupplyUSDC)
		})

		it(`Should be able to liquidate for with fee`, async () => {
			await liquidatePool.connect(admin).setLiquidateFeeRate(1000000)

			const liquidateSTBT = amountToSupplyUSDC.mul(1e12)
			const beforeUSDPAmount = await wstbtPool.balanceOf(usdcInvestor.address)
			await wstbtPool
				.connect(usdcInvestor)
				.liquidateBorrow(stbtInvestor.address, liquidateSTBT)
			const afterUSDPAmount = await wstbtPool.balanceOf(usdcInvestor.address)
			// There are some err in interest.
			expect(beforeUSDPAmount.sub(afterUSDPAmount)).to.be.within(
				liquidateSTBT.mul(99999).div(100000),
				liquidateSTBT.mul(100001).div(100000)
			)

			const mxpBalance = await wstbtToken.balanceOf(mxpRedeemPool.address)
			expect(mxpBalance).to.be.equal(liquidateSTBT)

			const fee = amountToSupplyUSDC.mul(1000000).div(100000000)

			const liquidationIndex = await liquidatePool.liquidationIndex()
			await usdcToken.connect(deployer).transfer(liquidatePool.address, amountToSupplyUSDC)
			const beforeUSDCAmount = await usdcToken.balanceOf(usdcInvestor.address)
			await liquidatePool.connect(usdcInvestor).finalizeLiquidationById(liquidationIndex)
			const afterUSDCAmount = await usdcToken.balanceOf(usdcInvestor.address)
			expect(afterUSDCAmount.sub(beforeUSDCAmount)).to.be.equal(amountToSupplyUSDC.sub(fee))
			const feeCollectorBalance = await usdcToken.balanceOf(feeCollector.address)
			expect(feeCollectorBalance).to.be.equal(fee)
		})

		it(`Should be able to liquidate for with interest`, async () => {
			now = now + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)

			// to realize interest
			await wstbtPool.connect(admin).setReserveFactor(0)

			const liquidateSTBT = await wstbtPool.getBorrowedAmount(stbtInvestor.address)

			// ~= 5.2% apr
			expect(liquidateSTBT.div(1e12)).to.be.within(
				amountToSupplyUSDC.mul(10510).div(10000),
				amountToSupplyUSDC.mul(10530).div(10000)
			)

			const beforeUSDPAmount = await wstbtPool.balanceOf(usdcInvestor.address)
			await wstbtPool
				.connect(usdcInvestor)
				.liquidateBorrow(stbtInvestor.address, liquidateSTBT)
			const afterUSDPAmount = await wstbtPool.balanceOf(usdcInvestor.address)
			// There are some err in interest.
			expect(beforeUSDPAmount.sub(afterUSDPAmount)).to.be.within(
				liquidateSTBT.mul(99999).div(100000),
				liquidateSTBT.mul(100001).div(100000)
			)

			const mxpBalance = await wstbtToken.balanceOf(mxpRedeemPool.address)
			expect(mxpBalance).to.be.equal(liquidateSTBT)

			const liquidationIndex = await liquidatePool.liquidationIndex()
			await usdcToken
				.connect(deployer)
				.transfer(liquidatePool.address, liquidateSTBT.div(1e12))
			const beforeUSDCAmount = await usdcToken.balanceOf(usdcInvestor.address)
			await liquidatePool.connect(usdcInvestor).finalizeLiquidationById(liquidationIndex)
			const afterUSDCAmount = await usdcToken.balanceOf(usdcInvestor.address)
			expect(afterUSDCAmount.sub(beforeUSDCAmount)).to.be.equal(liquidateSTBT.div(1e12))
		})

		it(`Should be able to finalizeLiquidationById for twice`, async () => {
			const liquidateSTBT = amountToSupplyUSDC.mul(1e12)
			await wstbtPool
				.connect(usdcInvestor)
				.liquidateBorrow(stbtInvestor.address, liquidateSTBT)
			const liquidationIndex = await liquidatePool.liquidationIndex()
			await usdcToken.connect(deployer).transfer(liquidatePool.address, amountToSupplyUSDC)
			await liquidatePool.connect(usdcInvestor).finalizeLiquidationById(liquidationIndex)
			await expect(
				liquidatePool.connect(usdcInvestor).finalizeLiquidationById(liquidationIndex)
			).to.be.revertedWith("Withdrawn")
		})

		it(`Should be able to finalizeLiquidationById from others`, async () => {
			const liquidateSTBT = amountToSupplyUSDC.mul(1e12)
			await wstbtPool
				.connect(usdcInvestor)
				.liquidateBorrow(stbtInvestor.address, liquidateSTBT)
			const liquidationIndex = await liquidatePool.liquidationIndex()
			await usdcToken.connect(deployer).transfer(liquidatePool.address, amountToSupplyUSDC)
			await expect(
				liquidatePool.connect(stbtInvestor).finalizeLiquidationById(liquidationIndex)
			).to.be.revertedWith("Not yours.")
		})

		// it(`Should be able to liquidate without otc`, async () => {
		// 	await liquidatePool.connect(admin).setRedemptionOption(false)
		// 	const liquidateSTBT = amountToSupplyUSDC.mul(1e12)
		// 	const beforeUSDPAmount = await wstbtPool.balanceOf(usdcInvestor.address)
		// 	await wstbtPool
		// 		.connect(usdcInvestor)
		// 		.liquidateBorrow(stbtInvestor.address, liquidateSTBT)
		// 	const afterUSDPAmount = await wstbtPool.balanceOf(usdcInvestor.address)

		// 	// There are some err in interest.
		// 	expect(beforeUSDPAmount.sub(afterUSDPAmount)).to.be.within(
		// 		liquidateSTBT.mul(99999).div(100000),
		// 		liquidateSTBT.mul(100001).div(100000)
		// 	)

		// 	const mxpBalance = await wstbtToken.balanceOf(mxpRedeemPool.address)
		// 	expect(mxpBalance).to.be.equal(liquidateSTBT)
		// })

		it(`Should be not able to finalizeLiquidationById when the proccess not done yet.`, async () => {
			await liquidatePool.connect(admin).setProcessPeriod(ONE_WEEK)
			const liquidateSTBT = amountToSupplyUSDC.mul(1e12)
			await wstbtPool
				.connect(usdcInvestor)
				.liquidateBorrow(stbtInvestor.address, liquidateSTBT)
			const liquidationIndex = await liquidatePool.liquidationIndex()
			await usdcToken.connect(deployer).transfer(liquidatePool.address, amountToSupplyUSDC)
			await expect(
				liquidatePool.connect(usdcInvestor).finalizeLiquidationById(liquidationIndex)
			).to.be.revertedWith("Not done yet.")
		})

		it("Should be not able to more than user owns.", async () => {
			const liquidateSTBT = await wstbtPool.balanceOf(admin.address)
			await expect(
				wstbtPool
					.connect(admin)
					.liquidateBorrow(stbtInvestor.address, liquidateSTBT.add(100))
			).to.be.revertedWith("BALANCE_EXCEEDED")
		})

		it("Should be not able to liquidate self", async () => {
			const liquidateSTBT = await wstbtPool.balanceOf(stbtInvestor.address)
			await expect(
				wstbtPool
					.connect(stbtInvestor)
					.liquidateBorrow(stbtInvestor.address, liquidateSTBT.add(100))
			).to.be.revertedWith("don't liquidate self.")
		})

		it("Should be not able to more than borrower's debt.", async () => {
			// to realize interest
			await wstbtPool.connect(admin).setReserveFactor(0)
			const liquidateSTBT = await wstbtPool.getBorrowedAmount(stbtInvestor.address)
			await expect(
				wstbtPool
					.connect(usdcInvestor)
					.liquidateBorrow(stbtInvestor.address, liquidateSTBT.mul(2))
			).to.be.revertedWith("repayAmount should be less than borrower's debt.")
		})
	})
	describe("Set process period", function () {
		it("Should be not able to set _processPeriod over 7 days", async () => {
			await expect(
				liquidatePool.connect(admin).setProcessPeriod(ONE_WEEK + 1)
			).to.be.revertedWith("should be less than 7 days")
		})
	})
})
