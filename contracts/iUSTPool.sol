// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interfaces/ISTBT.sol";
import "./interfaces/IInterestRateModel.sol";
import "./interfaces/ILiquidatePool.sol";
import "./iUSTP.sol";

contract iUSTPool is iUSTP, AccessControl, Pausable {
	using SafeMath for uint256;

	bytes32 public constant POOL_MANAGER_ROLE = keccak256("POOL_MANAGER_ROLE");

	uint256 public lastCheckpoint;
	// Used to calculate the interest base.
	uint256 public constant APR_COEFFICIENT = 1e8;
	// Used to calculate the fee base.
	uint256 public constant FEE_COEFFICIENT = 1e8;
	// Used to calculate shares of STBT deposited by users.
	uint256 public totalDepositedSharesSTBT;
	// Used to calculate total supply of iUSTP.
	uint256 public totalSupplyiUSTP;

	uint256 public safeCollateralRate = 101 * 1e18;
	uint256 public reserveFactor;

	// Used to record the user's STBT shares.
	mapping(address => uint256) public depositedSharesSTBT;
	// Used to record the user's loan shares of iUSTP.
	mapping(address => uint256) borrowedShares;
	uint256 public totalBorrowShares;

	// Used to be a flash liquidate provider
	mapping(address => bool) flashLiquidateProvider;
	mapping(address => bool) pendingFlashLiquidateProvider;

	// We assume that the interest rate will not exceed 10%.
	uint256 public constant maxInterestRate = APR_COEFFICIENT / 10;

	// collateral token.
	ISTBT public stbt;
	// Used to mint iUSTP.
	IERC20 public usdc;
	// interest rate model
	IInterestRateModel public interestRateModel;
	ILiquidatePool public liquidatePool;

	// the claimable fee for protocol
	// reserves will be claim with iUSTP.
	uint256 public totalUnclaimReserves;

	event SupplySTBT(address indexed user, uint256 amount, uint256 shares, uint256 timestamp);
	event SupplyUSDC(address indexed user, uint256 amount, uint256 timestamp);
	event Mint(address indexed user, uint256 amount, uint256 timestamp);
	event Burn(address indexed user, uint256 amount, uint256 timestamp);
	event WithdrawSTBT(address indexed user, uint256 amount, uint256 shares, uint256 timestamp);
	event WithdrawUSDC(address indexed user, uint256 amount, uint256 timestamp);
	event BorrowUSDC(address indexed user, uint256 amount, uint256 borrowShares, uint256 timestamp);
	event RepayUSDC(address indexed user, uint256 amount, uint256 borrowShares, uint256 timestamp);

	event ReservesAdded(uint256 addAmount, uint256 newTotalUnclaimReserves);
	event LiquidationRecord(
		address liquidator,
		address indexed borrower,
		uint256 iUSTPAmount,
		uint256 timestamp
	);

	event SafeCollateralRateChanged(uint256 newSafeRatio);

	// 0 is not, 1 is pending, 2 is a provider.
	event FlashLiquidateProvider(address user, uint8 status);

	constructor(
		address admin,
		ISTBT _stbt,
		IERC20 _usdc
	) ERC20("Interest-bearing USD of TProtocol", "iUSTP") {
		_setupRole(DEFAULT_ADMIN_ROLE, admin);
		stbt = _stbt;
		usdc = _usdc;
	}

	modifier realizeInterest() {
		if (totalSupplyiUSTP != 0) {
			uint256 totalInterest = getRPS().mul(block.timestamp.sub(lastCheckpoint));
			uint256 reserves = totalInterest.mul(reserveFactor).div(FEE_COEFFICIENT);

			totalSupplyiUSTP = totalSupplyiUSTP.add(totalInterest).sub(reserves);
			totalUnclaimReserves = totalUnclaimReserves.add(reserves);

			emit ReservesAdded(reserves, totalUnclaimReserves);
		}
		lastCheckpoint = block.timestamp;
		_;
	}

	/**
	 * @notice Pause the contract. Revert if already paused.
	 */
	function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
		_pause();
	}

	/**
	 * @notice Unpause the contract. Revert if already unpaused.
	 */
	function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
		_unpause();
	}

	/**
	 * @dev to set the liquidate pool
	 * @param _address the address of liquidate pool
	 */
	function initLiquidatePool(
		address _address
	) external onlyRole(DEFAULT_ADMIN_ROLE) realizeInterest {
		require(address(liquidatePool) == address(0), "initialized.");
		liquidatePool = ILiquidatePool(_address);
	}

	/**
	 * @dev claim protocol's reserves fee
	 * @param _receiver the address be used to receive reserves fee.
	 */
	function claimReservesFee(
		address _receiver
	) external realizeInterest onlyRole(DEFAULT_ADMIN_ROLE) {
		_mintiUSTP(_receiver, totalUnclaimReserves);
		totalUnclaimReserves = 0;
	}

	/**
	 * @dev to set the rate of manager fee
	 * @param _reserveFactor the rate. it should be multiply 10**6
	 */
	function setReserveFactor(
		uint256 _reserveFactor
	) external onlyRole(POOL_MANAGER_ROLE) realizeInterest {
		require(_reserveFactor <= FEE_COEFFICIENT, "reserve factor should be less than 100%.");
		reserveFactor = _reserveFactor;
	}

	/**
	 * @dev to set interest rate model
	 * @param _interestRateModel the model address
	 */
	function setInterestRateModel(
		IInterestRateModel _interestRateModel
	) external onlyRole(POOL_MANAGER_ROLE) realizeInterest {
		// To ensure 100% utilization.
		uint256 supplyInterestRate = _interestRateModel.getSupplyInterestRate(
			totalSupplyiUSTP,
			totalSupplyiUSTP
		);
		require(
			supplyInterestRate <= maxInterestRate,
			"interest rate should be less than maxInterestRate."
		);
		interestRateModel = _interestRateModel;
	}

	/**
	 * @notice  safeCollateralRate
	 */
	function setSafeCollateralRate(
		uint256 newSafeRatio
	) external onlyRole(POOL_MANAGER_ROLE) realizeInterest {
		require(newSafeRatio >= 101 * 1e18, "Safe CollateralRate should more than 101%");
		safeCollateralRate = newSafeRatio;
		emit SafeCollateralRateChanged(newSafeRatio);
	}

	/**
	 * @notice Supply USDC.
	 * Emits a `SupplyUSDC` event.
	 *
	 * @param _amount the amount of USDC
	 */
	function supplyUSDC(uint256 _amount) external realizeInterest whenNotPaused {
		require(_amount > 0, "Supply USDC should more then 0.");
		usdc.transferFrom(msg.sender, address(this), _amount);

		// convert to iUSTP.
		uint256 convertToiUSTP = _amount.mul(1e12);

		_mintiUSTP(msg.sender, convertToiUSTP);

		emit SupplyUSDC(msg.sender, _amount, block.timestamp);
	}

	/**
	 * @notice Supply STBT.
	 * Emits a `SupplySTBT` event.
	 *
	 * @param _amount the amount of STBT.
	 */
	function supplySTBT(uint256 _amount) external whenNotPaused realizeInterest {
		require(_amount > 0, "Supply STBT should more then 0.");

		uint256 beforeShares = stbt.sharesOf(address(this));
		stbt.transferFrom(msg.sender, address(this), _amount);
		uint256 afterShares = stbt.sharesOf(address(this));

		uint256 userDepositedShares = afterShares.sub(beforeShares);

		totalDepositedSharesSTBT += userDepositedShares;
		depositedSharesSTBT[msg.sender] += userDepositedShares;

		emit SupplySTBT(msg.sender, _amount, userDepositedShares, block.timestamp);
	}

	/**
	 * @notice Withdraw STBT to an address.
	 * Emits a `WithdrawSTBT` event.
	 *
	 * @param _amount the amount of STBT.
	 */
	function withdrawSTBT(uint256 _amount) external whenNotPaused realizeInterest {
		require(_amount > 0, "Withdraw STBT should more then 0.");

		uint256 withdrawShares = stbt.getSharesByAmount(_amount);
		totalDepositedSharesSTBT -= withdrawShares;
		depositedSharesSTBT[msg.sender] -= withdrawShares;

		_requireIsSafeCollateralRate(msg.sender);
		stbt.transfer(msg.sender, _amount);

		emit WithdrawSTBT(msg.sender, _amount, withdrawShares, block.timestamp);
	}

	/**
	 * @notice Withdraw USDC to an address.
	 * iUSTP:USDC always 1:1.
	 * Emits a `WithdrawUSDC` event.
	 *
	 * @param _amount the amount of USDC.
	 */
	function withdrawUSDC(uint256 _amount) external whenNotPaused realizeInterest {
		require(_amount > 0, "Withdraw USDC should more then 0.");

		// convert to iUSTP.
		uint256 convertToiUSTP = _amount.mul(10 ** 12);

		_burniUSTP(msg.sender, convertToiUSTP);
		usdc.transfer(msg.sender, _amount);

		emit WithdrawUSDC(msg.sender, _amount, block.timestamp);
	}

	/**
	 * @notice Borrow USDC to an address.
	 * Emits a `BorrowUSDC` event.
	 *
	 * @param _amount the amount of USDC.
	 */
	function borrowUSDC(uint256 _amount) external whenNotPaused realizeInterest {
		require(_amount > 0, "Borrow USDC should more then 0.");

		// convert to iUSTP.
		uint256 convertToiUSTP = _amount.mul(10 ** 12);

		uint256 borrowShares = getSharesByiUSTPAmount(convertToiUSTP);
		borrowedShares[msg.sender] += borrowShares;
		totalBorrowShares += borrowShares;

		require(
			getiUSTPAmountByShares(totalBorrowShares) <= totalSupplyiUSTP,
			"shold be less then supply of iUSTP."
		);
		_requireIsSafeCollateralRate(msg.sender);

		usdc.transfer(msg.sender, _amount);

		emit BorrowUSDC(msg.sender, _amount, borrowShares, block.timestamp);
	}

	/**
	 * @notice Repay USDC from user
	 * Emits a `RepayUSDC` event.
	 *
	 * @param _amount the amount of USDC.
	 */
	function repayUSDC(uint256 _amount) external whenNotPaused realizeInterest {
		require(_amount > 0, "Repay USDC should more then 0.");

		usdc.transferFrom(msg.sender, address(this), _amount);
		// convert to iUSTP.
		uint256 convertToiUSTP = _amount.mul(1e12);

		uint256 repayShares = getSharesByiUSTPAmount(convertToiUSTP);
		_repay(msg.sender, repayShares);

		emit RepayUSDC(msg.sender, _amount, repayShares, block.timestamp);
	}

	/**
	 * @notice Repay all USDC from user
	 * Emits a `RepayUSDC` event.
	 *
	 */
	function repayAll() external whenNotPaused realizeInterest {
		uint256 userBorrowShares = borrowedShares[msg.sender];

		uint256 repayiUSTP = getiUSTPAmountByShares(userBorrowShares);
		// convert to USDC.
		uint256 convertToUSDC = repayiUSTP.div(1e12) + 1;
		usdc.transferFrom(msg.sender, address(this), convertToUSDC);
		_repay(msg.sender, userBorrowShares);

		emit RepayUSDC(msg.sender, convertToUSDC, userBorrowShares, block.timestamp);
	}

	/**
	 * @notice The sender liquidates the borrowers collateral.
	 * *Can be liquidated at any time*
	 * Emits a `LiquidationRecord` event.
	 *
	 * @param borrower The borrower be liquidated
	 * @param repayAmount The amount of the iUSTP to repay
	 */
	function liquidateBorrow(
		address borrower,
		uint256 repayAmount
	) external whenNotPaused realizeInterest {
		require(msg.sender != borrower, "don't liquidate self");
		uint256 borrowedUSD = getiUSTPAmountByShares(borrowedShares[borrower]);
		require(borrowedUSD >= repayAmount, "repayAmount should be less than borrower's debt.");
		_burniUSTP(msg.sender, repayAmount);

		uint256 repayShares = getSharesByiUSTPAmount(repayAmount);

		_repay(borrower, repayShares);

		// always assuming STBT:iUSTP is 1:1.
		uint256 lqiuidateShares = stbt.getSharesByAmount(repayAmount);
		// TODO maybe no need to check.
		require(
			depositedSharesSTBT[borrower] >= lqiuidateShares,
			"lqiuidateShares should be less than borrower's deposit."
		);
		totalDepositedSharesSTBT -= lqiuidateShares;
		depositedSharesSTBT[borrower] -= lqiuidateShares;

		stbt.transfer(address(liquidatePool), repayAmount);
		liquidatePool.liquidateSTBT(msg.sender, repayAmount);

		emit LiquidationRecord(msg.sender, borrower, repayAmount, block.timestamp);
	}

	/**
	 * @notice The sender liquidates the borrowers collateral by Curve.
	 * *Can be liquidated at any time*
	 * Emits a `LiquidationRecord` event.
	 *
	 * @param borrower The borrower be liquidated
	 * @param repayAmount The amount of the iUSTP to repay
	 * @param j token of index for curve pool
	 * @param minReturn the minimum amount of return
	 */
	function flashLiquidateBorrow(
		address borrower,
		uint256 repayAmount,
		int128 j,
		uint256 minReturn
	) external whenNotPaused realizeInterest {
		require(flashLiquidateProvider[borrower], "borrower is not a provider.");
		require(msg.sender != borrower, "don't liquidate self.");
		uint256 borrowedUSD = getiUSTPAmountByShares(borrowedShares[borrower]);
		require(borrowedUSD >= repayAmount, "repayAmount should be less than borrower's debt.");
		_burniUSTP(msg.sender, repayAmount);

		uint256 repayShares = getSharesByiUSTPAmount(repayAmount);

		_repay(borrower, repayShares);

		// always assuming STBT:iUSTP is 1:1.
		uint256 lqiuidateShares = stbt.getSharesByAmount(repayAmount);
		// TODO maybe no need to check.
		require(
			depositedSharesSTBT[borrower] >= lqiuidateShares,
			"lqiuidateShares should be less than borrower's deposit."
		);
		totalDepositedSharesSTBT -= lqiuidateShares;
		depositedSharesSTBT[borrower] -= lqiuidateShares;

		stbt.transfer(address(liquidatePool), repayAmount);
		liquidatePool.flashLiquidateSTBTByCurve(repayAmount, j, minReturn, msg.sender);

		emit LiquidationRecord(msg.sender, borrower, repayAmount, block.timestamp);
	}

	/**
	 * @notice User chooses to apply a provider
	 */
	function applyFlashLiquidateProvider() external {
		pendingFlashLiquidateProvider[msg.sender] = true;
		emit FlashLiquidateProvider(msg.sender, 1);
	}

	/**
	 * @notice User chooses to cancel a provider
	 */
	function cancelFlashLiquidateProvider() external {
		pendingFlashLiquidateProvider[msg.sender] = false;
		flashLiquidateProvider[msg.sender] = false;
		emit FlashLiquidateProvider(msg.sender, 0);
	}

	/**
	 * @notice Admin accept a apply for provider
	 */
	function acceptFlashLiquidateProvider(address user) external onlyRole(POOL_MANAGER_ROLE) {
		require(pendingFlashLiquidateProvider[user], "the user did not apply.");
		pendingFlashLiquidateProvider[user] = false;
		flashLiquidateProvider[user] = true;
		emit FlashLiquidateProvider(user, 2);
	}

	/**
	 * @notice Get the borrowed shares of user
	 *
	 * @param user the address of borrower
	 */

	function getBorrowedSharesOf(address user) external view returns (uint256) {
		return borrowedShares[user];
	}

	/**
	 * @notice Get the borrowed amount of user
	 *
	 * @param user the address of borrower
	 */

	function getBorrowedAmount(address user) external view returns (uint256) {
		return getiUSTPAmountByShares(borrowedShares[user]);
	}

	/**
	 * @dev mint iUSTP for _receiver.
	 * Emits`Mint` and `Transfer` event.
	 *
	 * @param _receiver the address be used to receive iUSTP.
	 * @param _amount the amount of iUSTP.
	 */
	function _mintiUSTP(address _receiver, uint256 _amount) internal {
		uint256 sharesAmount = getSharesByiUSTPAmount(_amount);
		if (sharesAmount == 0) {
			//iUSTP shares are 1:1 to USDC at first.
			sharesAmount = _amount;
		}
		_mintShares(_receiver, sharesAmount);
		totalSupplyiUSTP += _amount;
		emit Mint(msg.sender, _amount, block.timestamp);
		emit Transfer(address(0), _receiver, _amount);
	}

	/**
	 * @dev burn iUSTP from _receiver.
	 * Emits`Burn` and `Transfer` event.
	 *
	 * @param _account the address be used to burn iUSTP.
	 * @param _amount the amount of iUSTP.
	 */
	function _burniUSTP(address _account, uint256 _amount) internal {
		uint256 sharesAmount = getSharesByiUSTPAmount(_amount);
		require(sharesAmount > 0, "shares should be more then 0.");
		_burnShares(_account, sharesAmount);
		totalSupplyiUSTP -= _amount;
		emit Burn(msg.sender, _amount, block.timestamp);
		emit Transfer(_account, address(0), _amount);
	}

	/**
	 * @dev repay iUSTP for _account
	 * Emits`Burn` and `Transfer` event.
	 *
	 * @param _account the address be usde to burn iUSTP.
	 * @param _repayShares the amount of iUSTP shares.
	 */
	function _repay(address _account, uint256 _repayShares) internal {
		borrowedShares[_account] -= _repayShares;
		totalBorrowShares -= _repayShares;
	}

	/**
	 * @notice total supply of iUSTP.
	 */
	function _getTotalSupplyiUSTP() internal view override returns (uint256) {
		return totalSupplyiUSTP;
	}

	/**
	 * @dev Return USD value of STBT
	 * it should be equal to $1.
	 * maybe possible through the oracle.
	 */
	function _stbtPrice() internal pure returns (uint256) {
		return 1e18;
	}

	/**
	 * @dev The USD value of the collateral asset must be higher than safeCollateralRate.
	 */
	function _requireIsSafeCollateralRate(address user) internal view {
		uint256 borrowedAmount = getiUSTPAmountByShares(borrowedShares[user]);
		if (borrowedAmount == 0) {
			return;
		}
		require(
			(stbt.getAmountByShares(depositedSharesSTBT[user]).mul(_stbtPrice()).mul(100) /
				borrowedAmount) >= safeCollateralRate,
			"Cannot be lower than the safeCollateralRate."
		);
	}

	/**
	 * @dev revolutions per second
	 */
	function getRPS() public view returns (uint256) {
		uint256 _totalSupplyiUSTP = _getTotalSupplyiUSTP();
		uint256 supplyInterestRate = interestRateModel.getSupplyInterestRate(
			_totalSupplyiUSTP,
			getiUSTPAmountByShares(totalBorrowShares)
		);
		require(
			supplyInterestRate <= maxInterestRate,
			"interest rate should be less than maxInterestRate."
		);
		return supplyInterestRate.mul(_totalSupplyiUSTP).div(365 days).div(APR_COEFFICIENT);
	}
}
