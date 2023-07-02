// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./interfaces/InUSTPool.sol";
import "./interfaces/IwTBTPoolV2Permission.sol";
import "./interfaces/ITreasury.sol";

contract migrator {
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	address public admin;
	// nustpool
	address public nustpool;
	address public wtbt;
	address public treasury;
	address public stbt;
	address public borrower;

	constructor(
		address _admin,
		address _nustpool,
		address _wtbt,
		address _treasury,
		address _stbt,
		address _borrower
	) {
		require(_admin != address(0), "!_admin");
		require(_nustpool != address(0), "!_nustpool");
		require(_wtbt != address(0), "!_wtbt");
		require(_treasury != address(0), "!_treasury");
		require(_stbt != address(0), "!_stbt");
		require(_borrower != address(0), "!_borrower");

		admin = _admin;
		nustpool = _nustpool;
		wtbt = _wtbt;
		treasury = _treasury;
		stbt = _stbt;
		borrower = _borrower;
	}

	modifier onlyAdmin() {
		require(msg.sender == admin, "only admin");
		_;
	}

	function migrate(uint256 _amount) external {
		IERC20(wtbt).safeTransferFrom(msg.sender, address(this), _amount);
		uint256 underlyAmount = IwTBTPoolV2Permission(wtbt).getUnderlyingByCToken(_amount);
		// convert to STBT amount
		underlyAmount = underlyAmount.mul(1e12);
		ITreasury(treasury).recoverERC20(stbt, underlyAmount);
		InUSTPool(nustpool).migrate(msg.sender, borrower, underlyAmount);
	}

	/**
	 * @dev to set the borrower
	 * @param _borrower the address of borrower
	 */
	function setBorrower(address _borrower) external onlyAdmin {
		require(_borrower != address(0), "!_borrower");
		borrower = _borrower;
	}

	/**
	 * @dev Allows to recovery any ERC20 token
	 * @param tokenAddress Address of the token to recovery
	 * @param amountToRecover Amount of collateral to transfer
	 */
	function recoverERC20(address tokenAddress, uint256 amountToRecover) external onlyAdmin {
		IERC20(tokenAddress).safeTransfer(admin, amountToRecover);
	}
}
