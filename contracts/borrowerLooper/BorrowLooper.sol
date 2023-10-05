// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "../interfaces/IrUSTPool.sol";
import "../interfaces/ICurve.sol";
import "../interfaces/ISTBT.sol";
import "../interfaces/IMinter.sol";

contract BorrowLooper is AccessControlUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable {
	using SafeMathUpgradeable for uint256;
	using SafeERC20Upgradeable for IERC20Upgradeable;

	bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
	bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
	bytes32 public constant DEPOSITOR_ROLE = keccak256("DEPOSITOR_ROLE");

	IERC20Upgradeable public stbt;
	IERC20Upgradeable public usdc;

	ICurve public curvePool;
	IMinter public stbtMinter;
	IrUSTPool public rustpool;

	function initialize(address _admin, address _rustpool) public initializer {
		__AccessControl_init();
		__Pausable_init();
		__ReentrancyGuard_init();

		_setupRole(DEFAULT_ADMIN_ROLE, _admin);
		_setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
		_setRoleAdmin(MANAGER_ROLE, ADMIN_ROLE);

		_setupRole(ADMIN_ROLE, _admin);
		_setupRole(MANAGER_ROLE, _admin);

		rustpool = IrUSTPool(_rustpool);
	}

	function setCuverPool(address _cuverPool) external onlyRole(MANAGER_ROLE) {
		require(_cuverPool != address(0), "target address not be zero.");
		curvePool = ICurve(_cuverPool);
	}

	function setSTBTMinter(address _stbtMinter) external onlyRole(MANAGER_ROLE) {
		require(_stbtMinter != address(0), "!_stbtMinter");
		stbtMinter = IMinter(_stbtMinter);
	}

	function depostSTBT(uint256 amount) external onlyRole(DEPOSITOR_ROLE) {
		stbt.safeTransferFrom(msg.sender, address(this), amount);
		stbt.safeApprove(address(rustpool), type(uint256).max);
		rustpool.supplySTBT(amount);
		stbt.safeApprove(address(rustpool), 0);
	}

	function withdrawSTBT(uint256 amount) external onlyRole(DEPOSITOR_ROLE) {
		rustpool.withdrawSTBT(amount);
		stbt.safeTransfer(msg.sender, stbt.balanceOf(address(this)));
	}

	function withdrawAllSTBT() external onlyRole(DEPOSITOR_ROLE) {
		rustpool.withdrawAllSTBT();
		stbt.safeTransfer(msg.sender, stbt.balanceOf(address(this)));
	}

	function depositUSDC(uint256 amount) external onlyRole(DEPOSITOR_ROLE) {
		usdc.safeTransferFrom(msg.sender, address(this), amount);
		usdc.safeApprove(address(rustpool), type(uint256).max);
		rustpool.supplyUSDC(amount);
		usdc.safeApprove(address(rustpool), 0);
	}

	function withdrawUSDC(uint256 amount) external onlyRole(DEPOSITOR_ROLE) {
		rustpool.supplyUSDC(amount);
		usdc.safeTransfer(msg.sender, usdc.balanceOf(address(this)));
	}

	function withdrawAllUSDC() external onlyRole(DEPOSITOR_ROLE) {
		rustpool.withdrawAllUSDC();
		usdc.safeTransfer(msg.sender, usdc.balanceOf(address(this)));
	}

	function repayUSDC(uint256 amount) external onlyRole(DEPOSITOR_ROLE) {
		usdc.safeTransferFrom(msg.sender, address(this), amount);
		usdc.safeApprove(address(rustpool), type(uint256).max);
		rustpool.repayUSDC(amount);
		usdc.safeApprove(address(rustpool), 0);
	}

	function loopByCurve(
		uint256 minUSDCPrice,
		uint256 minBorrowUSDC,
		uint256 looptime
	) external onlyRole(MANAGER_ROLE) returns (uint256 totalAmount) {
		uint256 safeCollateralRate = rustpool.safeCollateralRate();
		usdc.safeApprove(address(curvePool), type(uint256).max);
		stbt.safeApprove(address(rustpool), type(uint256).max);
		for (uint i = 0; i < looptime; i++) {
			uint256 availableUSDC = usdc.balanceOf(address(rustpool));
			if (availableUSDC < minBorrowUSDC) {
				break;
			}
			uint256 borrowMax = (ISTBT(address(stbt))
				.getAmountByShares(rustpool.depositedSharesSTBT(address(this)))
				.mul(1e18)
				.mul(100) / safeCollateralRate) -
				rustpool.getBorrowedAmount(address(this)).div(1e12);
			uint256 dy = curvePool.get_dy_underlying(2, 0, borrowMax);
			if (dy.mul(1e6).div(borrowMax.mul(1e12)) < minUSDCPrice) {
				break;
			}
			rustpool.borrowUSDC(borrowMax);
			curvePool.exchange_underlying(2, 0, borrowMax, dy);
			rustpool.supplySTBT(dy);
			totalAmount += dy;
		}
		usdc.safeApprove(address(curvePool), 0);
		stbt.safeApprove(address(rustpool), 0);
	}

	function borrowUSDCAndMintSTBT(uint256 borrowAmount) external onlyRole(MANAGER_ROLE) {
		rustpool.borrowUSDC(borrowAmount);
		usdc.safeApprove(address(stbtMinter), type(uint256).max);
		bytes32 salt = keccak256(abi.encodePacked(msg.sender, borrowAmount, block.timestamp));
		stbtMinter.mint(
			address(usdc),
			borrowAmount,
			borrowAmount.mul(1e12),
			salt,
			bytes("looper: mint stbt")
		);
		usdc.safeApprove(address(stbtMinter), 0);
	}

	function depostMintedSTBT() external onlyRole(MANAGER_ROLE) {
		stbt.safeApprove(address(rustpool), type(uint256).max);
		rustpool.supplySTBT(stbt.balanceOf(address(this)));
		stbt.safeApprove(address(rustpool), 0);
	}
}
