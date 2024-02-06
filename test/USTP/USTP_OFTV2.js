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
	deployUSTPOFTV2Fixture,
	deployUSTPControllerFixture,
	deployrUSTPVaultFixture,
	deployrUSTPRiskModelFixture,
} = require("../common/allFixture")

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

describe("USTP_OFT", function () {
	let admin, deployer, usdcInvestor, stbtInvestor, mxpRedeemPool, feeCollector
	let daiToken, usdcToken, usdtToken, stbtToken, USTP_OFTV2token
	let stbtSwapPool
	let priceFeed, interestRateModel
	let rustpool, liquidatePool
	let now
	let tokens
	let rUSTPVault, rUSTPRiskModel

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
		;({ USTP_OFTV2token } = await deployUSTPOFTV2Fixture(admin, deployer, rustpool))
		;({ controller } = await deployUSTPControllerFixture(deployer, admin))
		;({ rUSTPVault } = await deployrUSTPVaultFixture(
			deployer,
			admin,
			rustpool,
			USTP_OFTV2token
		))
		;({ rUSTPRiskModel } = await deployrUSTPRiskModelFixture(
			deployer,
			// using fake pool
			USTP_OFTV2token,
			USTP_OFTV2token,
			usdcToken
		))

		await USTP_OFTV2token.connect(admin).setController(controller.address)

		await controller.connect(admin).setUSTPMinter(rUSTPVault.address, true)
		await controller
			.connect(admin)
			.setVaultRiskModel(rUSTPVault.address, rUSTPRiskModel.address)

		await controller.connect(admin).setUSTPCap(BIGNUMBER)
		await rUSTPVault.connect(admin).setMintCap(BIGNUMBER)

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

	describe("Deposit USTP", function () {
		it("Should be able to deposit", async function () {
			await rustpool.connect(usdcInvestor).approve(rUSTPVault.address, amountToSupplyrUSTP)
			const supplyBalance = await rustpool
				.connect(usdcInvestor)
				.balanceOf(usdcInvestor.address)

			await rUSTPVault.connect(usdcInvestor).deposit(amountToSupplyrUSTP)

			expect(await USTP_OFTV2token.balanceOf(usdcInvestor.address)).to.be.equal(supplyBalance)
		})

		it("Should fail if deposit zero rUSTP", async function () {
			await expect(rUSTPVault.connect(stbtInvestor).deposit(0)).to.be.revertedWith(
				"can't deposit zero rUSTP"
			)
		})

		it("Should fail if more then cap", async function () {
			await rustpool.connect(usdcInvestor).approve(rUSTPVault.address, amountToSupplyrUSTP)

			await rUSTPVault.connect(admin).setMintCap(amountToSupplyrUSTP.sub(1))
			await expect(
				rUSTPVault.connect(usdcInvestor).deposit(amountToSupplyrUSTP)
			).to.be.revertedWith("over cap")
		})
	})

	describe("Withdraw USTP", function () {
		beforeEach(async () => {
			await rustpool.connect(usdcInvestor).approve(rUSTPVault.address, amountToSupplyrUSTP)
			await rUSTPVault.connect(usdcInvestor).deposit(amountToSupplyrUSTP)
		})
		it("Should be able to withdraw", async function () {
			const beforeBalance = await rustpool.balanceOf(usdcInvestor.address)
			const withdrawAmount = await USTP_OFTV2token.balanceOf(usdcInvestor.address)
			await rUSTPVault.connect(usdcInvestor).withdraw(withdrawAmount)

			expect(await rustpool.balanceOf(usdcInvestor.address)).to.be.equal(
				beforeBalance.add(withdrawAmount)
			)
		})

		it("Should fail if withdraw zero rUSTP", async function () {
			await expect(rUSTPVault.connect(stbtInvestor).withdraw(0)).to.be.revertedWith(
				"can't withdraw zero rUSTP"
			)
		})
	})

	describe("Claim rUSTP", function () {
		beforeEach(async () => {
			await rustpool.connect(usdcInvestor).approve(rUSTPVault.address, amountToSupplyrUSTP)
			await rUSTPVault.connect(usdcInvestor).deposit(amountToSupplyrUSTP)
		})
		it("Should be able to claim", async function () {
			await rustpool.connect(admin).setReserveFactor(0)
			const beforeBalance = await rustpool.balanceOf(admin.address)
			now = now + ONE_YEAR
			await mineBlockWithTimestamp(ethers.provider, now)
			// to realize interest
			await rustpool.connect(admin).setReserveFactor(0)
			await rUSTPVault.connect(admin).claimrUSTP(admin.address)
			const afterBalance = await rustpool.balanceOf(admin.address)
			const claimAmount = afterBalance.sub(beforeBalance)
			// ~ 5.2%
			expect(claimAmount).to.be.within(
				amountToSupplyrUSTP.mul(50).div(1000),
				amountToSupplyrUSTP.mul(52).div(1000)
			)
		})
	})
})
