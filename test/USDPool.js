const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { ethers } = require("hardhat")
const { expect } = require("chai")

const {
	deployTokensFixture,
	deployCurvePoolFixture,
	deployMockPriceFeedFixture,
	deployUSDPoolFixture,
	deployLiquidatePoolFixture,
	deployInterestRateModelFixture,
	deploySTBTTokensFixture,
} = require("./common/allFixture")

const ONE_HOUR = 3600
const ONE_DAY = ONE_HOUR * 24
const ONE_WEEK = ONE_DAY * 7
const ONE_MONTH = ONE_DAY * 30
const ONE_YEAR = ONE_DAY * 365

const mineBlockWithTimestamp = async (provider, timestamp) => {
	await provider.send("evm_mine", [timestamp])
	return Promise.resolve()
}

describe("USDPool", function () {
	let admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool
	let daiToken, usdcToken, usdtToken, stbtToken
	let stbtSwapPool
	let priceFeed, interestRateModel
	let usdpool, liquidatePool
	let now

	const permission = {
		sendAllowed: true,
		receiveAllowed: true,
		expiryTime: 0,
	}

	beforeEach("load fixture", async () => {
		;[admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool] = await ethers.getSigners()
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
		;({ usdpool } = await deployUSDPoolFixture(admin, deployer, stbtToken, usdcToken))
		;({ liquidatePool } = await deployLiquidatePoolFixture(
			admin,
			deployer,
			usdpool,
			mxpRedeemPool,
			stbtToken,
			usdcToken,
			priceFeed,
			[daiToken.address, usdcToken.address, usdtToken.address]
		))
		;({ interestRateModel } = await deployInterestRateModelFixture(deployer))

		await liquidatePool.connect(admin).setCurvePool(stbtSwapPool.address)
		await usdpool.connect(admin).initLiquidatePool(liquidatePool.address)
		await usdpool.connect(admin).setInterestRateModel(interestRateModel.address)

		await stbtToken.connect(deployer).setPermission(liquidatePool.address, permission)
		await stbtToken.connect(deployer).setPermission(usdpool.address, permission)

		now = (await ethers.provider.getBlock("latest")).timestamp
	})
	const amountToSupplyUSDC = ethers.utils.parseUnits("100", 6) // 100 USDC
	const amountToSupplySTBT = ethers.utils.parseUnits("100", 18) // 100 STBT
	const amountToBorrowUSDC = ethers.utils.parseUnits("98", 6) // 98 USDC

	describe("Supply USDC", function () {
		it("Should be able to supply", async function () {
			await usdcToken.connect(usdcInvestor).approve(usdpool.address, amountToSupplyUSDC)
			await usdpool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
			expect(await usdpool.balanceOf(usdcInvestor.address)).to.be.equal(
				ethers.utils.parseUnits("100", 18)
			)
		})

		it("Should fail if supply zero USDC", async function () {
			await expect(usdpool.connect(usdcInvestor).supplyUSDC(0)).to.be.revertedWith(
				"Supply USDC should more then 0."
			)
		})
	})
	describe("Supply STBT", function () {
		it("Should be able to supply", async function () {
			await stbtToken.connect(stbtInvestor).approve(usdpool.address, amountToSupplySTBT)

			const supplySTBTshares = await stbtToken.getSharesByAmount(amountToSupplySTBT)

			await usdpool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT)

			expect(await usdpool.depositedSharesSTBT(stbtInvestor.address)).to.be.equal(
				supplySTBTshares
			)
		})

		it("Should fail if supply zero STBT", async function () {
			await expect(usdpool.connect(stbtInvestor).supplySTBT(0)).to.be.revertedWith(
				"Supply STBT should more then 0."
			)
		})
	})

	describe("Withdraw", function () {
		beforeEach(async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			await usdcToken.connect(usdcInvestor).approve(usdpool.address, amountToSupplyUSDC)
			await usdpool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
			await stbtToken.connect(stbtInvestor).approve(usdpool.address, amountToSupplySTBT)
			await usdpool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT)
		})
		describe("Withdraw USDC", function () {
			it("Should be able to withdraw", async function () {
				const usdcAmountBefore = await usdcToken.balanceOf(usdcInvestor.address)

				const usdpAmount = await usdpool.balanceOf(usdcInvestor.address)
				await usdpool.connect(usdcInvestor).withdrawUSDC(amountToSupplyUSDC)

				const usdcAmountAfter = await usdcToken.balanceOf(usdcInvestor.address)

				expect(await usdpool.balanceOf(usdcInvestor.address)).to.be.equal(0)
				expect(usdcAmountAfter).to.be.equal(usdpAmount.div(1e12).add(usdcAmountBefore))
			})

			it("Should fail if withdraw zero USDC", async function () {
				await expect(usdpool.connect(usdcInvestor).withdrawUSDC(0)).to.be.revertedWith(
					"Withdraw USDC should more then 0."
				)
			})

			it("Should fail if withdraw more than supply", async function () {
				await expect(
					usdpool.connect(usdcInvestor).withdrawUSDC(amountToSupplyUSDC + 1)
				).to.be.revertedWith("BALANCE_EXCEEDED")
			})
		})
		describe("Withdraw STBT", function () {
			it("Should be able to withdraw", async function () {
				const stbtAmountBefore = await stbtToken.balanceOf(stbtInvestor.address)
				await usdpool.connect(stbtInvestor).withdrawSTBT(amountToSupplySTBT)

				const stbtAmountAfter = await stbtToken.balanceOf(stbtInvestor.address)

				expect(await usdpool.depositedSharesSTBT(stbtInvestor.address)).to.be.equal(0)
				expect(stbtAmountAfter).to.be.equal(amountToSupplySTBT.add(stbtAmountBefore))
			})

			it("Should fail if supply zero STBT", async function () {
				await expect(usdpool.connect(stbtInvestor).withdrawSTBT(0)).to.be.revertedWith(
					"Withdraw STBT should more then 0."
				)
			})

			it("Should fail if withdraw more than supply", async function () {
				await expect(usdpool.connect(stbtInvestor).withdrawSTBT(amountToSupplySTBT + 1)).to
					.be.reverted
			})
		})
	})
	describe("Borrow", function () {
		beforeEach(async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			await usdcToken.connect(usdcInvestor).approve(usdpool.address, amountToSupplyUSDC)
			await usdpool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
			await stbtToken.connect(stbtInvestor).approve(usdpool.address, amountToSupplySTBT)
			await usdpool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT)
		})
		describe("Borrow USDC", function () {
			it("Should be able to borrow", async function () {
				const usdcAmountBefore = await usdcToken.balanceOf(stbtInvestor.address)

				const borrowShares = await usdpool.getSharesByUSDPAmount(
					amountToBorrowUSDC.mul(1e12)
				)
				await usdpool.connect(stbtInvestor).borrowUSDC(amountToBorrowUSDC)

				const usdcAmountAfter = await usdcToken.balanceOf(stbtInvestor.address)

				expect(await usdpool.getBorrowedSharesOf(stbtInvestor.address)).to.be.equal(
					borrowShares
				)
				expect(await usdpool.totalBorrowShares()).to.be.equal(borrowShares)
				expect(usdcAmountAfter).to.be.equal(amountToBorrowUSDC.add(usdcAmountBefore))
			})

			it("Should be able to borrow more when STBT distribute", async function () {
				const usdcAmountBefore = await usdcToken.balanceOf(stbtInvestor.address)

				const doubleBorrow = amountToBorrowUSDC.mul(2)
				await usdcToken.connect(usdcInvestor).approve(usdpool.address, amountToSupplyUSDC)
				await usdpool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
				const totalSupplySTBT = await stbtToken.totalSupply()
				await stbtToken.connect(deployer).distributeInterests(totalSupplySTBT, now, now + 1)

				const borrowShares = await usdpool.getSharesByUSDPAmount(doubleBorrow.mul(1e12))
				await usdpool.connect(stbtInvestor).borrowUSDC(doubleBorrow)

				const usdcAmountAfter = await usdcToken.balanceOf(stbtInvestor.address)

				expect(await usdpool.getBorrowedSharesOf(stbtInvestor.address)).to.be.equal(
					borrowShares
				)
				expect(await usdpool.totalBorrowShares()).to.be.equal(borrowShares)
				expect(usdcAmountAfter).to.be.equal(doubleBorrow.add(usdcAmountBefore))
			})

			it("Should fail if borrow zero USDC", async function () {
				await expect(usdpool.connect(stbtInvestor).borrowUSDC(0)).to.be.revertedWith(
					"Borrow USDC should more then 0."
				)
			})

			it("Should fail if borrow more than collateral", async function () {
				await expect(
					usdpool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC)
				).to.be.revertedWith("Cannot be lower than the safeCollateralRate.")
			})
		})
	})

	describe("Interest", function () {
		beforeEach(async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			await usdcToken.connect(usdcInvestor).approve(usdpool.address, amountToSupplyUSDC)
			await usdpool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC)
			await stbtToken
				.connect(stbtInvestor)
				.approve(usdpool.address, amountToSupplySTBT.mul(2))
			await usdpool.connect(stbtInvestor).supplySTBT(amountToSupplySTBT.mul(2))
		})
		describe("Gain interest", function () {
			it("Should be able to full interest when 100% utilization rate", async function () {
				// borrow all usdc
				await usdpool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC)
				now = now + ONE_YEAR
				await mineBlockWithTimestamp(ethers.provider, now)

				// to realize interest
				await usdpool.connect(admin).setReserveFactor(0)

				const usdpAmount = await usdpool.balanceOf(usdcInvestor.address)

				// ~= 4.2% apr
				expect(usdpAmount.div(1e12)).to.be.within(
					amountToSupplyUSDC.mul(10410).div(10000),
					amountToSupplyUSDC.mul(10430).div(10000)
				)
			})
			it("Should be able to half interest when 50% utilization rate", async function () {
				// borrow all usdc
				await usdpool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC.div(2))
				now = now + ONE_YEAR
				await mineBlockWithTimestamp(ethers.provider, now)

				// to realize interest
				await usdpool.connect(admin).setReserveFactor(0)

				const usdpAmount = await usdpool.balanceOf(usdcInvestor.address)

				// ~= 2.1% apr
				expect(usdpAmount.div(1e12)).to.be.within(
					amountToSupplyUSDC.mul(10205).div(10000),
					amountToSupplyUSDC.mul(10215).div(10000)
				)
			})

			it("Should be able to withdraw interest income", async function () {
				// borrow all usdc
				await usdpool.connect(stbtInvestor).borrowUSDC(amountToSupplyUSDC)
				now = now + ONE_YEAR
				await mineBlockWithTimestamp(ethers.provider, now)

				// to realize interest
				await usdpool.connect(admin).setReserveFactor(0)

				await usdcToken
					.connect(stbtInvestor)
					.approve(usdpool.address, amountToSupplyUSDC.mul(2))
				await usdpool.connect(stbtInvestor).supplyUSDC(amountToSupplyUSDC.mul(2))

				const usdcAmountBefore = await usdcToken.balanceOf(usdcInvestor.address)

				const usdpAmount = await usdpool.balanceOf(usdcInvestor.address)
				await usdpool.connect(usdcInvestor).withdrawUSDC(usdpAmount.div(1e12))

				const usdcAmountAfter = await usdcToken.balanceOf(usdcInvestor.address)

				expect(usdcAmountAfter).to.be.equal(usdpAmount.div(1e12).add(usdcAmountBefore))
			})
		})
	})
})
