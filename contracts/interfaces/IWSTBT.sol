// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWSTBT is IERC20 {
	function tokensPerStbt() external view returns (uint256);

	function getWstbtByStbt(uint256 stbtAmount) external view returns (uint256);

	function getStbtByWstbt(uint256 wstbtAmount) external view returns (uint256);

	function stbtPerToken() external view returns (uint256);
}
