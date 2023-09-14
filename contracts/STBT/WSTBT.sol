// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import "../interfaces/ISTBT.sol";

contract WSTBT is ERC20Permit {
	address public immutable stbtAddress; // = 0x530824DA86689C9C17CdC2871Ff29B058345b44a;

	event Wrap(address indexed sender, uint stbtAmount, uint shares);
	event Unwrap(address indexed sender, uint stbtAmount, uint shares);

	constructor(
		string memory name_,
		string memory symbol_,
		address stbtAddress_
	) ERC20Permit(name_) ERC20(name_, symbol_) {
		stbtAddress = stbtAddress_;
	}

	function wrap(uint256 stbtAmount) public returns (uint wrappedShares) {
		require(stbtAmount != 0, "WSTBT: ZERO_AMOUNT");
		wrappedShares = ISTBT(stbtAddress).getSharesByAmount(stbtAmount);
		ISTBT(stbtAddress).transferFrom(msg.sender, address(this), stbtAmount);
		_mint(msg.sender, wrappedShares);
		emit Wrap(msg.sender, stbtAmount, wrappedShares);
	}

	function unwrap(uint256 unwrappedShares) public returns (uint stbtAmount) {
		require(unwrappedShares != 0, "WSTBT: ZERO_AMOUNT");
		stbtAmount = ISTBT(stbtAddress).getAmountByShares(unwrappedShares);
		ISTBT(stbtAddress).transfer(msg.sender, stbtAmount);
		_burn(msg.sender, unwrappedShares);
		emit Unwrap(msg.sender, stbtAmount, unwrappedShares);
	}

	function getWstbtByStbt(uint256 stbtAmount) external view returns (uint256) {
		return ISTBT(stbtAddress).getSharesByAmount(stbtAmount);
	}

	function getStbtByWstbt(uint256 wstbtAmount) external view returns (uint256) {
		return ISTBT(stbtAddress).getAmountByShares(wstbtAmount);
	}

	function stbtPerToken() external view returns (uint256) {
		return ISTBT(stbtAddress).getAmountByShares(1 ether);
	}

	function tokensPerStbt() external view returns (uint256) {
		return ISTBT(stbtAddress).getSharesByAmount(1 ether);
	}
}
