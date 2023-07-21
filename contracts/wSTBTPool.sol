// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interfaces/IInterestRateModel.sol";
import "./interfaces/IwSTBTLiquidatePool.sol";
import "./rUSTP.sol";

contract wWSTBTPool is rUSTP, AccessControl, Pausable {
	using SafeMath for uint256;

	bytes32 public constant POOL_MANAGER_ROLE = keccak256("POOL_MANAGER_ROLE");

	uint256 public lastCheckpoint;
	// Used to calculate the interest base.
	uint256 public constant APR_COEFFICIENT = 1e8;
	// Used to calculate the fee base.
	uint256 public constant FEE_COEFFICIENT = 1e8;
	// Used to calculate shares of WSTBT deposited by users.
	uint256 public totalDepositedBalancesWSTBT;
	// Used to calculate total supply of rUSTP.
	uint256 public totalSupplyrUSTP;

	uint256 public safeCollateralRate = 101 * 1e18;
	uint256 public reserveFactor;

	// Used to record the user's WSTBT shares.
	mapping(address => uint256) public depositedAmountWSTBT;
	// Used to record the user's loan shares of rUSTP.
	mapping(address => uint256) borrowedShares;
	uint256 public totalBorrowShares;

	// Used to be a flash liquidate provider
	mapping(address => bool) flashLiquidateProvider;
	mapping(address => bool) pendingFlashLiquidateProvider;

	// We assume that the interest rate will not exceed 10%.
	uint256 public constant maxInterestRate = APR_COEFFICIENT / 10;

	// collateral token.
	IERC20 public wstbt;
	// Used to mint rUSTP.
	IERC20 public usdc;
	// interest rate model
	IInterestRateModel public interestRateModel;
	IwSTBTLiquidatePool public liquidatePool;

	// the claimable fee for protocol
	// reserves will be claim with rUSTP.
	uint256 public totalUnclaimReserves;

	event SupplyWSTBT(address indexed user, uint256 amount, uint256 shares, uint256 timestamp);
	event SupplyUSDC(address indexed user, uint256 amount, uint256 timestamp);
	event Mint(address indexed user, uint256 amount, uint256 timestamp);
	event Burn(address indexed user, uint256 amount, uint256 timestamp);
	event WithdrawWSTBT(address indexed user, uint256 amount, uint256 shares, uint256 timestamp);
	event WithdrawUSDC(address indexed user, uint256 amount, uint256 timestamp);
	event BorrowUSDC(address indexed user, uint256 amount, uint256 borrowShares, uint256 timestamp);
	event RepayUSDC(address indexed user, uint256 amount, uint256 borrowShares, uint256 timestamp);

	event ReservesAdded(uint256 addAmount, uint256 newTotalUnclaimReserves);
	event LiquidationRecord(
		address liquidator,
		address indexed borrower,
		uint256 rUSTPAmount,
		uint256 timestamp
	);

	event SafeCollateralRateChanged(uint256 newSafeRatio);

	// 0 is not, 1 is pending, 2 is a provider.
	event FlashLiquidateProvider(address user, uint8 status);

	constructor(
		address admin,
		IERC20 _wstbt,
		IERC20 _usdc
	) ERC20("Interest-bearing USD of TProtocol", "rUSTP") {
		_setupRole(DEFAULT_ADMIN_ROLE, admin);
		wstbt = _wstbt;
		usdc = _usdc;
	}

	modifier realizeInterest() {
		if (totalSupplyrUSTP != 0) {
			uint256 totalInterest = getRPS().mul(block.timestamp.sub(lastCheckpoint));
			uint256 reserves = totalInterest.mul(reserveFactor).div(FEE_COEFFICIENT);

			totalSupplyrUSTP = totalSupplyrUSTP.add(totalInterest).sub(reserves);
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
		liquidatePool = IwSTBTLiquidatePool(_address);
	}

	/**
	 * @dev claim protocol's reserves fee
	 * @param _receiver the address be used to receive reserves fee.
	 */
	function claimReservesFee(
		address _receiver
	) external realizeInterest onlyRole(DEFAULT_ADMIN_ROLE) {
		_mintrUSTP(_receiver, totalUnclaimReserves);
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
			totalSupplyrUSTP,
			totalSupplyrUSTP
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

		// convert to rUSTP.
		uint256 convertTorUSTP = _amount.mul(1e12);

		_mintrUSTP(msg.sender, convertTorUSTP);

		emit SupplyUSDC(msg.sender, _amount, block.timestamp);
	}

	/**
	 * @notice Supply WSTBT.
	 * Emits a `SupplyWSTBT` event.
	 *
	 * @param _amount the amount of WSTBT.
	 */
	function supplyWSTBT(uint256 _amount) external whenNotPaused realizeInterest {
		require(_amount > 0, "Supply WSTBT should more then 0.");

		wstbt.transferFrom(msg.sender, address(this), _amount);

		totalDepositedBalancesWSTBT += _amount;
		depositedAmountWSTBT[msg.sender] += _amount;

		emit SupplyWSTBT(msg.sender, _amount, _amount, block.timestamp);
	}

	/**
	 * @notice Withdraw WSTBT to an address.
	 * Emits a `WithdrawWSTBT` event.
	 *
	 * @param _amount the amount of WSTBT.
	 */
	function withdrawWSTBT(uint256 _amount) external whenNotPaused realizeInterest {
		require(_amount > 0, "Withdraw WSTBT should more then 0.");

		totalDepositedBalancesWSTBT -= _amount;
		depositedAmountWSTBT[msg.sender] -= _amount;

		_requireIsSafeCollateralRate(msg.sender);
		wstbt.transfer(msg.sender, _amount);

		emit WithdrawWSTBT(msg.sender, _amount, _amount, block.timestamp);
	}

	/**
	 * @notice Withdraw USDC to an address.
	 * rUSTP:USDC always 1:1.
	 * Emits a `WithdrawUSDC` event.
	 *
	 * @param _amount the amount of USDC.
	 */
	function withdrawUSDC(uint256 _amount) external whenNotPaused realizeInterest {
		require(_amount > 0, "Withdraw USDC should more then 0.");

		// convert to rUSTP.
		uint256 convertTorUSTP = _amount.mul(10 ** 12);

		_burnrUSTP(msg.sender, convertTorUSTP);
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

		// convert to rUSTP.
		uint256 convertTorUSTP = _amount.mul(10 ** 12);

		uint256 borrowShares = getSharesByrUSTPAmount(convertTorUSTP);
		borrowedShares[msg.sender] += borrowShares;
		totalBorrowShares += borrowShares;

		require(
			getrUSTPAmountByShares(totalBorrowShares) <= totalSupplyrUSTP,
			"shold be less then supply of rUSTP."
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
		// convert to rUSTP.
		uint256 convertTorUSTP = _amount.mul(1e12);

		uint256 repayShares = getSharesByrUSTPAmount(convertTorUSTP);
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

		uint256 repayrUSTP = getrUSTPAmountByShares(userBorrowShares);
		// convert to USDC.
		uint256 convertToUSDC = repayrUSTP.div(1e12) + 1;
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
	 * @param repayAmount The amount of the rUSTP to repay
	 */
	function liquidateBorrow(
		address borrower,
		uint256 repayAmount
	) external whenNotPaused realizeInterest {
		require(msg.sender != borrower, "don't liquidate self");
		uint256 borrowedUSD = getrUSTPAmountByShares(borrowedShares[borrower]);
		require(borrowedUSD >= repayAmount, "repayAmount should be less than borrower's debt.");
		_burnrUSTP(msg.sender, repayAmount);

		uint256 repayShares = getSharesByrUSTPAmount(repayAmount);

		_repay(borrower, repayShares);

		uint256 liquidateAmount = repayAmount.mul(1e18).div(_wstbtPrice());
		// TODO maybe no need to check.
		require(
			depositedAmountWSTBT[borrower] >= liquidateAmount,
			"liquidateAmount should be less than borrower's deposit."
		);
		totalDepositedBalancesWSTBT -= liquidateAmount;
		depositedAmountWSTBT[borrower] -= liquidateAmount;

		wstbt.transfer(address(liquidatePool), repayAmount);
		liquidatePool.liquidateWSTBT(msg.sender, liquidateAmount);

		emit LiquidationRecord(msg.sender, borrower, repayAmount, block.timestamp);
	}

	/**
	 * @notice The sender liquidates the borrowers collateral by Curve.
	 * *Can be liquidated at any time*
	 * Emits a `LiquidationRecord` event.
	 *
	 * @param borrower The borrower be liquidated
	 * @param repayAmount The amount of the rUSTP to repay
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
		uint256 borrowedUSD = getrUSTPAmountByShares(borrowedShares[borrower]);
		require(borrowedUSD >= repayAmount, "repayAmount should be less than borrower's debt.");
		_burnrUSTP(msg.sender, repayAmount);

		uint256 repayShares = getSharesByrUSTPAmount(repayAmount);

		_repay(borrower, repayShares);

		uint256 liquidateAmount = repayAmount.mul(1e18).div(_wstbtPrice());
		// TODO maybe no need to check.
		require(
			depositedAmountWSTBT[borrower] >= liquidateAmount,
			"liquidateAmount should be less than borrower's deposit."
		);
		totalDepositedBalancesWSTBT -= liquidateAmount;
		depositedAmountWSTBT[borrower] -= liquidateAmount;

		wstbt.transfer(address(liquidatePool), repayAmount);
		liquidatePool.flashLiquidateWSTBTByCurve(repayAmount, j, minReturn, msg.sender);

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
		return getrUSTPAmountByShares(borrowedShares[user]);
	}

	/**
	 * @dev mint rUSTP for _receiver.
	 * Emits`Mint` and `Transfer` event.
	 *
	 * @param _receiver the address be used to receive rUSTP.
	 * @param _amount the amount of rUSTP.
	 */
	function _mintrUSTP(address _receiver, uint256 _amount) internal {
		uint256 sharesAmount = getSharesByrUSTPAmount(_amount);
		if (sharesAmount == 0) {
			//rUSTP shares are 1:1 to USDC at first.
			sharesAmount = _amount;
		}
		_mintShares(_receiver, sharesAmount);
		totalSupplyrUSTP += _amount;
		emit Mint(msg.sender, _amount, block.timestamp);
		emit Transfer(address(0), _receiver, _amount);
	}

	/**
	 * @dev burn rUSTP from _receiver.
	 * Emits`Burn` and `Transfer` event.
	 *
	 * @param _account the address be used to burn rUSTP.
	 * @param _amount the amount of rUSTP.
	 */
	function _burnrUSTP(address _account, uint256 _amount) internal {
		uint256 sharesAmount = getSharesByrUSTPAmount(_amount);
		require(sharesAmount > 0, "shares should be more then 0.");
		_burnShares(_account, sharesAmount);
		totalSupplyrUSTP -= _amount;
		emit Burn(msg.sender, _amount, block.timestamp);
		emit Transfer(_account, address(0), _amount);
	}

	/**
	 * @dev repay rUSTP for _account
	 * Emits`Burn` and `Transfer` event.
	 *
	 * @param _account the address be usde to burn rUSTP.
	 * @param _repayShares the amount of rUSTP shares.
	 */
	function _repay(address _account, uint256 _repayShares) internal {
		borrowedShares[_account] -= _repayShares;
		totalBorrowShares -= _repayShares;
	}

	/**
	 * @notice total supply of rUSTP.
	 */
	function _getTotalSupplyrUSTP() internal view override returns (uint256) {
		return totalSupplyrUSTP;
	}

	/**
	 * @dev Return USD value of WSTBT
	 * TODO Wait MXP's Oracle
	 * it should be equal to $1.
	 * maybe possible through the oracle.
	 */
	function _wstbtPrice() internal pure returns (uint256) {
		return 1e18;
	}

	/**
	 * @dev The USD value of the collateral asset must be higher than safeCollateralRate.
	 */
	function _requireIsSafeCollateralRate(address user) internal view {
		uint256 borrowedAmount = getrUSTPAmountByShares(borrowedShares[user]);
		if (borrowedAmount == 0) {
			return;
		}
		require(
			(depositedAmountWSTBT[user].mul(_wstbtPrice()).mul(100) / borrowedAmount) >=
				safeCollateralRate,
			"Cannot be lower than the safeCollateralRate."
		);
	}

	/**
	 * @dev revolutions per second
	 */
	function getRPS() public view returns (uint256) {
		uint256 _totalSupplyrUSTP = _getTotalSupplyrUSTP();
		uint256 supplyInterestRate = interestRateModel.getSupplyInterestRate(
			_totalSupplyrUSTP,
			getrUSTPAmountByShares(totalBorrowShares)
		);
		require(
			supplyInterestRate <= maxInterestRate,
			"interest rate should be less than maxInterestRate."
		);
		return supplyInterestRate.mul(_totalSupplyrUSTP).div(365 days).div(APR_COEFFICIENT);
	}
}
