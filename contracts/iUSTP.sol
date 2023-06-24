// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/InUSTP.sol";

contract iUSTP is ERC20, AccessControl {
	using SafeERC20 for ERC20;
	using SafeMath for uint256;

	ERC20 public nUSTP;

	constructor(address _admin, ERC20 _nUSTP) ERC20("Wrapped nUSTP", "iUSTP") {
		_setupRole(DEFAULT_ADMIN_ROLE, _admin);
		nUSTP = _nUSTP;
	}

	/**
	 * @dev the exchange rate of iUSTP
	 */
	function pricePerToken() external view returns (uint256) {
		return InUSTP(address(nUSTP)).getnUSTPAmountByShares(1 ether);
	}

	/**
	 * @dev warp nUSTP to iUSTP
	 * @param _amount the amount of nUSTP
	 */
	function warp(uint256 _amount) external {
		// equal shares
		uint256 depositShares = InUSTP(address(nUSTP)).getSharesBynUSTPAmount(_amount);
		require(depositShares > 0, "can't warp zero nUSTP");
		nUSTP.safeTransferFrom(msg.sender, address(this), _amount);
		_mint(msg.sender, depositShares);
	}

	/**
	 * @dev unwarp iUSTP to nUSTP
	 * @param _share the share of iUSTP
	 */
	function unwarp(uint256 _share) external {
		uint256 withdrawAmount = InUSTP(address(nUSTP)).getnUSTPAmountByShares(_share);
		require(withdrawAmount > 0, "can't unwarp zero nUSTP");
		_burn(msg.sender, _share);
		nUSTP.safeTransfer(msg.sender, withdrawAmount);
	}

	/**
	 * @dev wrap all iUSTP to nUSTP
	 */
	function unwarpAll() external {
		uint256 userBalance = balanceOf(msg.sender);
		uint256 withdrawAmount = InUSTP(address(nUSTP)).getnUSTPAmountByShares(userBalance);
		require(withdrawAmount > 0, "can't wrap zero iUSTP");
		_burn(msg.sender, userBalance);

		nUSTP.safeTransfer(msg.sender, withdrawAmount);
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
		require(tokenAddress != address(nUSTP), "can't recover nUSTP");
		ERC20(tokenAddress).safeTransfer(target, amountToRecover);
	}

	/**
	 * @dev Allows to recovery nUSTP
	 * @param target Address for receive token
	 */
	function recoverUSTP(address target) external onlyRole(DEFAULT_ADMIN_ROLE) {
		uint256 totalDepositShares = totalSupply();
		uint256 realLockShares = InUSTP(address(nUSTP)).sharesOf(address(this));
		uint256 recoverAmount = realLockShares - totalDepositShares;
		require(recoverAmount > 0, "no");
		nUSTP.safeTransfer(target, recoverAmount);
	}
}
