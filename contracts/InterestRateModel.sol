// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Interest rate model for TProtocol.
 *
 * linear function
 *
 */
contract InterestRateModel is AccessControl {
	// Assuming the maximum is 5.2%
	uint256 private APR = 52 * 1e5;

	event APRChanged(uint256 newAPR);

	constructor() {
		_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
	}

	/**
	 * @notice Set APR
	 */
	function setAPR(uint256 newAPR) external onlyRole(DEFAULT_ADMIN_ROLE) {
		require(newAPR <= 8 * 1e6, "apr should be less then 8%");
		APR = newAPR;
		emit APRChanged(newAPR);
	}

	/**
	 * @notice Calculates the current supply interest rate.
	 * @param totalSupply The amount of supply.
	 * @param totalBorrow The amount of borrows.
	 * @return The supply rate percentage.
	 */
	function getSupplyInterestRate(
		uint256 totalSupply,
		uint256 totalBorrow
	) public view returns (uint) {
		if (totalBorrow == 0) {
			return 0;
		} else if (totalBorrow >= totalSupply) {
			return APR;
		}
		return ((totalBorrow * APR) / totalSupply);
	}
}
