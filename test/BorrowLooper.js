const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers")
const { ethers, upgrades } = require("hardhat")
const { expect } = require("chai")

const {
	deployTokensFixture,
	deployCurvePoolFixture,
	deployMockPriceFeedFixture,
	deployrUSTPoolFixture,
	deployLiquidatePoolFixture,
	deployInterestRateModelFixture,
	deploySTBTTokensFixture,
	deployMockMinter,
} = require("./common/allFixture")

const ONE_HOUR = 3600
const ONE_DAY = ONE_HOUR * 24
const ONE_WEEK = ONE_DAY * 7
const ONE_MONTH = ONE_DAY * 30
const ONE_YEAR = ONE_DAY * 365

const BIGNUMBER = new ethers.BigNumber.from(2).pow(200)
const usdcPrice = new ethers.BigNumber.from(1e6)

const mineBlockWithTimestamp = async (provider, timestamp) => {
	await provider.send("evm_mine", [timestamp])
	return Promise.resolve()
}

describe("BorrowLooper", function () {
	let admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool, feeCollector
	let daiToken, usdcToken, usdtToken, stbtToken
	let stbtSwapPool
	let priceFeed, interestRateModel
	let rustpool, liquidatePool, looper
	let now
	let tokens
	let mockMinter

	const permission = {
		sendAllowed: true,
		receiveAllowed: true,
		expiryTime: 0,
	}

	beforeEach("load fixture", async () => {
		;[admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool, feeCollector, manager] =
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
		;({ mockMinter } = await deployMockMinter(deployer, stbtToken, mxpRedeemPool))
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

		await liquidatePool.connect(admin).setCurvePool(stbtSwapPool.address)
		await liquidatePool.connect(admin).setRedeemPool(mxpRedeemPool.address)
		await liquidatePool.connect(admin).setSTBTMinter(mockMinter.address)
		// must be less than 1.005 USD
		await liquidatePool.connect(admin).setPegPrice(99500000, 100500000)
		await rustpool.connect(admin).initLiquidatePool(liquidatePool.address)
		await rustpool.connect(admin).setInterestRateModel(interestRateModel.address)

		await stbtToken.connect(deployer).setPermission(mxpRedeemPool.address, permission)
		await stbtToken.connect(deployer).setPermission(liquidatePool.address, permission)
		await stbtToken.connect(deployer).setPermission(rustpool.address, permission)

		await liquidatePool.connect(admin).setFeeCollector(feeCollector.address)

		now = (await ethers.provider.getBlock("latest")).timestamp

		tokens = [daiToken, usdcToken, usdtToken]

        const BorrowLooper = await ethers.getContractFactory("BorrowLooper")
		looper = await upgrades.deployProxy(BorrowLooper, [
			admin.address,
            rustpool.address,
            stbtToken.address,
            usdcToken.address
		])

        await looper.deployed()

		// SET ROLE
		let DEPOSITOR_ROLE = await looper.DEPOSITOR_ROLE()
        await looper.connect(admin).grantRole(DEPOSITOR_ROLE, stbtInvestor.address)
        let MANAGER_ROLE = await looper.MANAGER_ROLE()
        await looper.connect(admin).grantRole(MANAGER_ROLE, manager.address)
        await looper.connect(admin).setCurvePool(stbtSwapPool.address)
        await looper.connect(admin).setSTBTMinter(mockMinter.address)
	})
	const amountToSupplyUSDC = ethers.utils.parseUnits("100", 6) // 100 USDC
	const amountToSupplySTBT = ethers.utils.parseUnits("100", 18) // 100 STBT
	const amountToBorrowUSDC = ethers.utils.parseUnits("98", 6) // 98 USDC
	describe("Supply", function () {
		describe("Supply STBT", function () {
			it("Should be able to supply", async function () {
				await stbtToken.connect(stbtInvestor).approve(looper.address, amountToSupplySTBT)

				const supplySTBTshares = await stbtToken.getSharesByAmount(amountToSupplySTBT)

				await looper.connect(stbtInvestor).depostSTBT(amountToSupplySTBT)

				expect(await rustpool.depositedSharesSTBT(looper.address)).to.be.equal(
					supplySTBTshares
				)
			})
		})
	})

	describe("Withdraw", function () {
		beforeEach(async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			await usdcToken.connect(stbtInvestor).approve(looper.address, amountToSupplyUSDC)
			await looper.connect(stbtInvestor).depositUSDC(amountToSupplyUSDC)
			await stbtToken.connect(stbtInvestor).approve(looper.address, amountToSupplySTBT)
			await looper.connect(stbtInvestor).depostSTBT(amountToSupplySTBT)
		})
		describe("Withdraw USDC", function () {
			it("Should be able to withdraw", async function () {
				const usdcAmountBefore = await usdcToken.balanceOf(stbtInvestor.address)

				const rustpAmount = await rustpool.balanceOf(looper.address)
				await looper.connect(stbtInvestor).withdrawUSDC(amountToSupplyUSDC)

				const usdcAmountAfter = await usdcToken.balanceOf(stbtInvestor.address)

				expect(await rustpool.balanceOf(looper.address)).to.be.equal(0)
				expect(usdcAmountAfter).to.be.equal(rustpAmount.div(1e12).add(usdcAmountBefore))
			})

			it("Should be able to withdraw all usdc", async function () {
                const usdcAmountBefore = await usdcToken.balanceOf(stbtInvestor.address)
				const rustpAmount = await rustpool.balanceOf(looper.address)
				await looper.connect(stbtInvestor).withdrawAllUSDC()

				const usdcAmountAfter = await usdcToken.balanceOf(stbtInvestor.address)

				expect(await rustpool.balanceOf(looper.address)).to.be.equal(0)
				expect(usdcAmountAfter).to.be.equal(rustpAmount.div(1e12).add(usdcAmountBefore))
			})

		})
		describe("Withdraw STBT", function () {
			it("Should be able to withdraw", async function () {
				const stbtAmountBefore = await stbtToken.balanceOf(stbtInvestor.address)
				await looper.connect(stbtInvestor).withdrawSTBT(amountToSupplySTBT)

				const stbtAmountAfter = await stbtToken.balanceOf(stbtInvestor.address)

				expect(await rustpool.depositedSharesSTBT(looper.address)).to.be.equal(0)
				expect(stbtAmountAfter).to.be.equal(amountToSupplySTBT.add(stbtAmountBefore))
			})

			it("Should be able to withdraw all stbt", async function () {
				const stbtAmountBefore = await stbtToken.balanceOf(stbtInvestor.address)
				await looper.connect(stbtInvestor).withdrawAllSTBT()

				const stbtAmountAfter = await stbtToken.balanceOf(stbtInvestor.address)

				expect(await rustpool.depositedSharesSTBT(looper.address)).to.be.equal(0)
				expect(stbtAmountAfter).to.be.equal(amountToSupplySTBT.add(stbtAmountBefore))
			})

			it("Should fail if supply zero STBT", async function () {
				await expect(looper.connect(stbtInvestor).withdrawSTBT(0)).to.be.revertedWith(
					"Withdraw STBT should more then 0."
				)
			})

			it("Should fail if withdraw more than supply", async function () {
				await expect(looper.connect(stbtInvestor).withdrawSTBT(amountToSupplySTBT + 1)).to
					.be.reverted
			})
		})
	})

	describe("Loop by curve", function () {
		beforeEach(async () => {
			now = now + ONE_HOUR
			await mineBlockWithTimestamp(ethers.provider, now)
			// await interestRateModel.connect(deployer).setAPR(0)
			await usdcToken.connect(usdcInvestor).approve(rustpool.address, amountToSupplyUSDC.mul(10000))
			await rustpool.connect(usdcInvestor).supplyUSDC(amountToSupplyUSDC.mul(10000))

            await stbtToken.connect(stbtInvestor).approve(looper.address, BIGNUMBER)
            await looper.connect(stbtInvestor).depostSTBT(amountToSupplySTBT.mul(1000))
		})
		describe("Loop borrow", function () {
			it("Should be able to loop", async function () {
                const beforeDepositAmount = await stbtToken.getAmountByShares(await rustpool.depositedSharesSTBT(looper.address))
                const beforeBorrowAmount = await rustpool.getBorrowedAmount(looper.address)
                const loopResp = await looper.connect(manager).callStatic.loopByCurve(usdcPrice.mul(90).div(100), 0, 10)
                await looper.connect(manager).loopByCurve(usdcPrice.mul(90).div(100), 0, 10)
                const afterDepositAmount = await stbtToken.getAmountByShares(await rustpool.depositedSharesSTBT(looper.address))
                const aftereBorrowAmount = await rustpool.getBorrowedAmount(looper.address)
				expect(afterDepositAmount.sub(loopResp.totalSTBTAmount)).to.be.within(
					beforeDepositAmount.mul(999).div(1000),
					beforeDepositAmount.mul(1001).div(1000)
				)
                expect(beforeBorrowAmount.add(loopResp.totalUSDCBorrow.mul(1e12))).to.be.equal(aftereBorrowAmount)
			})
            it("Should be able to mint", async function () {
                const beforeBorrowAmount = await rustpool.getBorrowedAmount(looper.address)
                await looper.connect(manager).borrowUSDCAndMintSTBT(amountToSupplyUSDC)
                const aftereBorrowAmount = await rustpool.getBorrowedAmount(looper.address)
                expect(beforeBorrowAmount.add(amountToSupplyUSDC.mul(1e12))).to.be.equal(aftereBorrowAmount)

                await stbtToken.connect(deployer).transfer(looper.address, amountToSupplySTBT)
                await looper.connect(manager).depostMintedSTBT()
                expect(await stbtToken.balanceOf(looper.address)).to.be.equal(0)
			})
		})

	})

})
