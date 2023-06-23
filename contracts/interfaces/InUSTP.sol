// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface InUSTP {
	function getSharesBynUSTPAmount(uint256 _nUSTPAmount) external view returns (uint256);

	function getnUSTPAmountByShares(uint256 _sharesAmount) external view returns (uint256);

	function sharesOf(address _account) external view returns (uint256);
}
