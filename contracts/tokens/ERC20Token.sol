// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Token is Ownable, ERC20 {
	uint8 internal immutable _decimals;

	constructor(string memory name, string memory symbol, uint8 __decimals) ERC20(name, symbol) {
		_decimals = __decimals;
	}

	/**
	 * @dev Function to mint tokens
	 * @param to The address that will receive the minted tokens.
	 * @param value The amount of tokens to mint.
	 * @return A boolean that indicates if the operation was successful.
	 */
	function mint(address to, uint256 value) public onlyOwner returns (bool) {
		_mint(to, value);
		return true;
	}
}
