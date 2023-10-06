// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockMinter {
	using SafeERC20 for IERC20;

	address public targetContract;
	address public poolAccount;

	constructor(address _targetContract, address _poolAccount) {
		targetContract = _targetContract;
		poolAccount = _poolAccount;
	}

	function redeem(uint amount, address token, bytes32 salt, bytes calldata extraData) external {
		IERC20(targetContract).safeTransferFrom(msg.sender, poolAccount, amount);
	}

	function mint(
		address token,
		uint depositAmount,
		uint minProposedAmount,
		bytes32 salt,
		bytes calldata extraData
	) external {
		IERC20(token).safeTransferFrom(msg.sender, poolAccount, depositAmount);
	}
}
