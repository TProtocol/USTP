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
	deployMockTreasury,
	deployMockwTBT,
	deployMigrator,
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

describe("migrator", function () {
	let admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool, feeCollector
	let daiToken, usdcToken, usdtToken, stbtToken, wtbtToken
	let stbtSwapPool
	let priceFeed, interestRateModel
	let rustpool, liquidatePool, mockTreasury, migrator
	let now
	let tokens
	let recovery

	const permission = {
		sendAllowed: true,
		receiveAllowed: true,
		expiryTime: 0,
	}

	beforeEach("load fixture", async () => {
		;[admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool, feeCollector, recovery] =
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
		;({ wtbtToken } = await deployMockwTBT(deployer))
		;({ mockTreasury } = await deployMockTreasury(deployer, recovery))

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
		;({ migrator } = await deployMigrator(
			deployer,
			rustpool,
			wtbtToken,
			mockTreasury,
			stbtToken,
			recovery
		))
		await stbtToken.connect(deployer).setPermission(migrator.address, permission)
		await stbtToken.connect(deployer).setPermission(recovery.address, permission)
		await stbtToken.connect(deployer).setPermission(mockTreasury.address, permission)
		await rustpool.connect(admin).initMigrator(migrator.address)
	})

	const amountToSupplySTBT = ethers.utils.parseUnits("100", 18) // 100 STBT
	describe("Migrate", function () {
		it("Should be able to migrate", async function () {
			await stbtToken.connect(deployer).transfer(mockTreasury.address, amountToSupplySTBT)
			await stbtToken.connect(recovery).approve(rustpool.address, amountToSupplySTBT)
			await wtbtToken.connect(deployer).approve(migrator.address, amountToSupplySTBT)

			const supplySTBTshares = await stbtToken.getSharesByAmount(amountToSupplySTBT)

			await migrator.connect(deployer).migrate(amountToSupplySTBT)
			// recovery's supply
			expect(await rustpool.depositedSharesSTBT(recovery.address)).to.be.equal(
				supplySTBTshares
			)
			const borrowShares = await rustpool.getSharesByrUSTPAmount(amountToSupplySTBT)
			// recovery's loan
			expect(await rustpool.getBorrowedSharesOf(recovery.address)).to.be.equal(borrowShares)
			expect(await rustpool.totalBorrowShares()).to.be.equal(borrowShares)
			// user used to migrate. receive rustp
			expect(await rustpool.balanceOf(deployer.address)).to.be.equal(amountToSupplySTBT)
		})
	})
})
