// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract MockPriceFeed {
	// mock usdc to $1
	function latestAnswer() public pure returns (int256) {
		return 100000000;
	}
}
