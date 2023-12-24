// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUSTP_OFTV2 is IERC20 {
	function mint(address user, uint256 amount) external;

	function burn(address user, uint256 amount) external;
}
