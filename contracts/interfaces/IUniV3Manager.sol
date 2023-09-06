// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniV3Manager is IERC20 {
	function increaseLiquidity(
		uint256 amount0Desired,
		uint256 amount1Desired,
		uint256 amount0Min,
		uint256 amount1Min
	) external returns (uint128 liquidity, uint256 amount0, uint256 amount1);

	function decreaseLiquidity(
		uint128 liquidity,
		uint256 amount0Min,
		uint256 amount1Min
	) external returns (uint256 amount0, uint256 amount1);
}
