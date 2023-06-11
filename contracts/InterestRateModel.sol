// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/**
 * @title Interest rate model for TProtocol.
 *
 * linear function
 *
 */
contract InterestRateModel {
	// Assuming the maximum is 4.2%
	uint256 private constant APR = 42 * 1e5;

	/**
	 * @notice Calculates the current supply interest rate.
	 * @param totalSupply The amount of supply.
	 * @param totalBorrow The amount of borrows.
	 * @return The supply rate percentage.
	 */
	function getSupplyInterestRate(
		uint256 totalSupply,
		uint256 totalBorrow
	) public pure returns (uint) {
		if (totalBorrow == 0) {
			return 0;
		}
		return ((totalBorrow * APR) / totalSupply);
	}
}
