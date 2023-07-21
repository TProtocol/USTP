// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IwSTBTLiquidatePool {
	function liquidateWSTBT(address caller, uint256 stbtAmount) external;

	function flashLiquidateWSTBTByCurve(
		uint256 stbtAmount,
		int128 j,
		uint256 minReturn,
		address receiver
	) external;
}
