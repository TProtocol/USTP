// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockTreasury {
	using SafeERC20 for IERC20;

	constructor(address _recovery) {
		require(_recovery != address(0), "!_recovery");
		recovery = _recovery;
	}

	// recovery fund wallet
	address public recovery;

	/**
	 * @dev Allows to recovery any ERC20 token
	 * @param tokenAddress Address of the token to recovery
	 * @param amountToRecover Amount of collateral to transfer
	 */
	function recoverERC20(address tokenAddress, uint256 amountToRecover) external {
		IERC20(tokenAddress).safeTransfer(recovery, amountToRecover);
	}
}
