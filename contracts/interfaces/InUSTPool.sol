// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface InUSTPool {
	function migrate(address _user, address _borrower, uint256 _amount) external;
}
