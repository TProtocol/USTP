// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockwTBT is ERC20("wTBT", "Mock wTBT") {
	constructor() {
		_mint(msg.sender, 10000000 * 1e18);
	}

	function getUnderlyingByCToken(uint256 _cTokenAmount) public pure returns (uint256) {
		// convert to USDC
		return _cTokenAmount / 1e12;
	}
}
