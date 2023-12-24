// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IUSTP_OFTV2.sol";

/**
 * @title Vault for rUSTP(Short-term T-Bill)
 *
 */

contract rUSTPVault is AccessControl {
	using SafeERC20 for ERC20;

	ERC20 public rUSTP;
	IUSTP_OFTV2 public USTP;

	uint256 public totalMintedUSTP;
	uint256 public USTPMintCap;

	uint256 public withdrawalFee;
	uint256 public constant FEE_BASE = 100_000;
	uint256 public constant maxFeeRate = FEE_BASE / 100;

	event NewUSTPMintCap(uint256 limited);
	event NewWithdrawalFee(uint256 fee);

	constructor(address _admin, ERC20 _rUSTP, IUSTP_OFTV2 _ustp) {
		_setupRole(DEFAULT_ADMIN_ROLE, _admin);
		rUSTP = _rUSTP;
		USTP = _ustp;
	}

	/**
	 * @dev deposit rUSTP to USTP
	 * @param _amount the amount of USTP
	 */
	function deposit(uint256 _amount) external {
		// equal amount
		require(_amount > 0, "can't deposit zero rUSTP");
		rUSTP.safeTransferFrom(msg.sender, address(this), _amount);
		_mintUSTP(msg.sender, _amount);
	}

	/**
	 * @dev withdraw USTP to rUSTP
	 * @param _amount the amount of USTP
	 */
	function withdraw(uint256 _amount) external {
		require(_amount > 0, "can't withdraw zero rUSTP");
		_burnUSTP(msg.sender, _amount);
		rUSTP.safeTransfer(msg.sender, _amount);
	}

	/**
	 * @dev wrap all iUSTP to rUSTP
	 */
	function unWrapAll() external {
		uint256 userBalance = USTP.balanceOf(msg.sender);
		require(userBalance > 0, "can't wrap zero iUSTP");
		_burnUSTP(msg.sender, userBalance);

		rUSTP.safeTransfer(msg.sender, userBalance);
	}

	function _mintUSTP(address _user, uint256 _amount) internal {
		require(totalMintedUSTP + _amount <= USTPMintCap, "over cap");
		USTP.mint(_user, _amount);
		totalMintedUSTP = totalMintedUSTP + _amount;
	}

	function _burnUSTP(address _user, uint256 _amount) internal {
		USTP.burn(_user, _amount);
		totalMintedUSTP = totalMintedUSTP - _amount;
	}

	function setWithdrawalFee(uint256 _fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
		require(maxFeeRate <= maxFeeRate, "fee less then 1%");
		withdrawalFee = _fee;
		emit NewWithdrawalFee(_fee);
	}

	function setMintCap(uint256 _cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
		USTPMintCap = _cap;
		emit NewUSTPMintCap(_cap);
	}

	/**
	 * @dev Allows to recovery any ERC20 token
	 * @param tokenAddress Address of the token to recovery
	 * @param target Address for receive token
	 * @param amountToRecover Amount of collateral to transfer
	 */
	function recoverERC20(
		address tokenAddress,
		address target,
		uint256 amountToRecover
	) external onlyRole(DEFAULT_ADMIN_ROLE) {
		require(tokenAddress != address(rUSTP), "can't recover rUSTP");
		ERC20(tokenAddress).safeTransfer(target, amountToRecover);
	}

	/**
	 * @dev Allows to claim rUSTP
	 * @param target Address for receive token
	 */
	function claimrUSTP(address target) external onlyRole(DEFAULT_ADMIN_ROLE) {
		uint256 totalDeposit = USTP.totalSupply();
		uint256 realLockAmount = rUSTP.balanceOf(address(this));
		uint256 claimAmount = realLockAmount - totalDeposit;
		require(claimAmount > 0, "no");
		rUSTP.safeTransfer(target, claimAmount);
	}
}
