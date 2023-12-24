// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity >=0.7.6 <0.9.0;

/// @title Uniswap V3 Static Oracle
/// @notice Oracle contract for calculating price quoting against Uniswap V3
interface IStaticOracle {
	/// @notice Returns a quote, based on the given tokens and amount, by querying only the specified pools
	/// @dev Will revert if one of the pools is not prepared/configured correctly for the given period
	/// @param baseAmount Amount of token to be converted
	/// @param baseToken Address of an ERC20 token contract used as the baseAmount denomination
	/// @param quoteToken Address of an ERC20 token contract used as the quoteAmount denomination
	/// @param pools The pools to consider when calculating the quote
	/// @param period Number of seconds from which to calculate the TWAP
	/// @return quoteAmount Amount of quoteToken received for baseAmount of baseToken
	function quoteSpecificPoolsWithTimePeriod(
		uint128 baseAmount,
		address baseToken,
		address quoteToken,
		address[] calldata pools,
		uint32 period
	) external view returns (uint256 quoteAmount);
}
