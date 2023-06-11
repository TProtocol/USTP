// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title Interest-bearing ERC20-like token for TProtocol.
 *
 * This contract is abstract. To make the contract deployable override the
 * `_getTotalSupplyUSTP` function. `USTPool.sol` contract inherits USTP and defines
 * the `_getTotalSupplyUSTP` function.
 *
 * USTP balances are dynamic and represent the holder's share in the total amount
 * of Ether controlled by the protocol. Account shares aren't normalized, so the
 * contract also stores the sum of all shares to calculate each account's token balance
 * which equals to:
 *
 *   shares[account] * _getTotalSupplyUSTP() / _getTotalShares()
 *
 * For example, assume that we have:
 *
 *   _getTotalSupplyUSTP() -> 10 USTP
 *   sharesOf(user1) -> 100
 *   sharesOf(user2) -> 400
 *
 * Therefore:
 *
 *   balanceOf(user1) -> 2 tokens which corresponds 2 USTP
 *   balanceOf(user2) -> 8 tokens which corresponds 8 USTP
 *
 * Since balances of all token holders change when the amount of total supplied USTP
 * changes, this token cannot fully implement ERC20 standard: it only emits `Transfer`
 * events upon explicit transfer between holders. In contrast, when total amount of
 * pooled Ether increases, no `Transfer` events are generated: doing so would require
 * emitting an event for each token holder and thus running an unbounded loop.
 */

abstract contract USTP is ERC20 {
	using SafeMath for uint256;
	uint256 private totalShares;

	/**
	 * @dev USTP balances are dynamic and are calculated based on the accounts' shares
	 * and the total amount of Ether controlled by the protocol. Account shares aren't
	 * normalized, so the contract also stores the sum of all shares to calculate
	 * each account's token balance which equals to:
	 *
	 *   shares[account] * _getTotalSupplyUSTP() / _getTotalShares()
	 */
	mapping(address => uint256) private shares;

	/**
	 * @dev Allowances are nominated in tokens, not token shares.
	 */
	mapping(address => mapping(address => uint256)) private allowances;

	/**
	 * @notice An executed shares transfer from `sender` to `recipient`.
	 *
	 * @dev emitted in pair with an ERC20-defined `Transfer` event.
	 */
	event TransferShares(address indexed from, address indexed to, uint256 sharesValue);

	/**
	 * @notice An executed `burnShares` request
	 *
	 * @dev Reports simultaneously burnt shares amount
	 * and corresponding USTP amount.
	 * The USTP amount is calculated twice: before and after the burning incurred rebase.
	 *
	 * @param account holder of the burnt shares
	 * @param preRebaseTokenAmount amount of USTP the burnt shares corresponded to before the burn
	 * @param postRebaseTokenAmount amount of USTP the burnt shares corresponded to after the burn
	 * @param sharesAmount amount of burnt shares
	 */
	event SharesBurnt(
		address indexed account,
		uint256 preRebaseTokenAmount,
		uint256 postRebaseTokenAmount,
		uint256 sharesAmount
	);

	/**
	 * @return the number of decimals for getting user representation of a token amount.
	 */
	function decimals() public pure override returns (uint8) {
		return 18;
	}

	/**
	 * @return the amount of tokens in existence.
	 *
	 * @dev Always equals to `_getTotalSupplyUSTP()` since token amount
	 * is pegged to the total amount of USTP controlled by the protocol.
	 */
	function totalSupply() public view override returns (uint256) {
		return _getTotalSupplyUSTP();
	}

	/**
	 * @return the amount of tokens owned by the `_account`.
	 *
	 * @dev Balances are dynamic and equal the `_account`'s share in the amount of the
	 * total USTP controlled by the protocol. See `sharesOf`.
	 */
	function balanceOf(address _account) public view override returns (uint256) {
		return getUSTPAmountByShares(_sharesOf(_account));
	}

	/**
	 * @return the total amount of shares in existence.
	 *
	 * @dev The sum of all accounts' shares can be an arbitrary number, therefore
	 * it is necessary to store it in order to calculate each account's relative share.
	 */
	function getTotalShares() public view returns (uint256) {
		return _getTotalShares();
	}

	/**
	 * @return the amount of shares owned by `_account`.
	 */
	function sharesOf(address _account) external view returns (uint256) {
		return _sharesOf(_account);
	}

	/**
	 * @return the amount of shares that corresponds to `_USTPAmount` protocol-supplied USTP.
	 */
	function getSharesByUSTPAmount(uint256 _USTPAmount) public view returns (uint256) {
		uint256 totalSupplyUSTP = _getTotalSupplyUSTP();
		return totalSupplyUSTP == 0 ? 0 : _USTPAmount.mul(_getTotalShares()).div(totalSupplyUSTP);
	}

	/**
	 * @return the amount of USTP that corresponds to `_sharesAmount` token shares.
	 */
	function getUSTPAmountByShares(uint256 _sharesAmount) public view returns (uint256) {
		uint256 totalSharesAmount = _getTotalShares();
		return
			totalSharesAmount == 0
				? 0
				: _sharesAmount.mul(_getTotalSupplyUSTP()).div(totalSharesAmount);
	}

	/**
	 * @notice Moves `_sharesAmount` token shares from the caller's account to the `_recipient` account.
	 *
	 * @return amount of transferred tokens.
	 * Emits a `TransferShares` event.
	 * Emits a `Transfer` event.
	 *
	 * Requirements:
	 *
	 * - `_recipient` cannot be the zero address.
	 * - the caller must have at least `_sharesAmount` shares.
	 * - the contract must not be paused.
	 *
	 * @dev The `_sharesAmount` argument is the amount of shares, not tokens.
	 */
	function transferShares(address _recipient, uint256 _sharesAmount) external returns (uint256) {
		_transferShares(msg.sender, _recipient, _sharesAmount);
		uint256 tokensAmount = getUSTPAmountByShares(_sharesAmount);
		_emitTransferEvents(msg.sender, _recipient, tokensAmount, _sharesAmount);
		return tokensAmount;
	}

	/**
	 * @return the total amount of USTP.
	 * @dev This is used for calculating tokens from shares and vice versa.
	 * @dev This function is required to be implemented in a derived contract.
	 */
	function _getTotalSupplyUSTP() internal view virtual returns (uint256);

	/**
	 * @notice Moves `_amount` tokens from `_sender` to `_recipient`.
	 * Emits a `Transfer` event.
	 * Emits a `TransferShares` event.
	 */
	function _transfer(address _sender, address _recipient, uint256 _amount) internal override {
		uint256 _sharesToTransfer = getSharesByUSTPAmount(_amount);
		_transferShares(_sender, _recipient, _sharesToTransfer);
		_emitTransferEvents(_sender, _recipient, _amount, _sharesToTransfer);
	}

	/**
	 * @return the total amount of shares in existence.
	 */
	function _getTotalShares() internal view returns (uint256) {
		return totalShares;
	}

	/**
	 * @return the amount of shares owned by `_account`.
	 */
	function _sharesOf(address _account) internal view returns (uint256) {
		return shares[_account];
	}

	/**
	 * @notice Moves `_sharesAmount` shares from `_sender` to `_recipient`.
	 *
	 * Requirements:
	 *
	 * - `_sender` cannot be the zero address.
	 * - `_recipient` cannot be the zero address.
	 * - `_sender` must hold at least `_sharesAmount` shares.
	 * - the contract must not be paused.
	 */
	function _transferShares(address _sender, address _recipient, uint256 _sharesAmount) internal {
		require(_sender != address(0), "TRANSFER_FROM_THE_ZERO_ADDRESS");
		require(_recipient != address(0), "TRANSFER_TO_THE_ZERO_ADDRESS");

		uint256 currentSenderShares = shares[_sender];
		require(_sharesAmount <= currentSenderShares, "TRANSFER_AMOUNT_EXCEEDS_BALANCE");

		shares[_sender] = currentSenderShares.sub(_sharesAmount);
		shares[_recipient] = shares[_recipient].add(_sharesAmount);
	}

	/**
	 * @notice Creates `_sharesAmount` shares and assigns them to `_recipient`, increasing the total amount of shares.
	 * @dev This doesn't increase the token total supply.
	 *
	 * NB: The method doesn't check protocol pause relying on the external enforcement.
	 *
	 * Requirements:
	 *
	 * - `_recipient` cannot be the zero address.
	 * - the contract must not be paused.
	 */
	function _mintShares(
		address _recipient,
		uint256 _sharesAmount
	) internal returns (uint256 newTotalShares) {
		require(_recipient != address(0), "MINT_TO_ZERO_ADDR");

		newTotalShares = _getTotalShares().add(_sharesAmount);
		totalShares = newTotalShares;

		shares[_recipient] = shares[_recipient].add(_sharesAmount);

		// Notice: we're not emitting a Transfer event from the zero address here since shares mint
		// works by taking the amount of tokens corresponding to the minted shares from all other
		// token holders, proportionally to their share. The total supply of the token doesn't change
		// as the result. This is equivalent to performing a send from each other token holder's
		// address to `address`, but we cannot reflect this as it would require sending an unbounded
		// number of events.
	}

	/**
	 * @notice Destroys `_sharesAmount` shares from `_account`'s holdings, decreasing the total amount of shares.
	 * @dev This doesn't decrease the token total supply.
	 *
	 * Requirements:
	 *
	 * - `_account` cannot be the zero address.
	 * - `_account` must hold at least `_sharesAmount` shares.
	 * - the contract must not be paused.
	 */
	function _burnShares(
		address _account,
		uint256 _sharesAmount
	) internal returns (uint256 newTotalShares) {
		require(_account != address(0), "BURN_FROM_ZERO_ADDR");

		uint256 accountShares = shares[_account];
		require(_sharesAmount <= accountShares, "BALANCE_EXCEEDED");

		uint256 preRebaseTokenAmount = getSharesByUSTPAmount(_sharesAmount);

		newTotalShares = _getTotalShares().sub(_sharesAmount);
		totalShares = newTotalShares;

		shares[_account] = accountShares.sub(_sharesAmount);

		uint256 postRebaseTokenAmount = getSharesByUSTPAmount(_sharesAmount);

		emit SharesBurnt(_account, preRebaseTokenAmount, postRebaseTokenAmount, _sharesAmount);

		// Notice: we're not emitting a Transfer event to the zero address here since shares burn
		// works by redistributing the amount of tokens corresponding to the burned shares between
		// all other token holders. The total supply of the token doesn't change as the result.
		// This is equivalent to performing a send from `address` to each other token holder address,
		// but we cannot reflect this as it would require sending an unbounded number of events.

		// We're emitting `SharesBurnt` event to provide an explicit rebase log record nonetheless.
	}

	/**
	 * @dev Emits {Transfer} and {TransferShares} events
	 */
	function _emitTransferEvents(
		address _from,
		address _to,
		uint _tokenAmount,
		uint256 _sharesAmount
	) internal {
		emit Transfer(_from, _to, _tokenAmount);
		emit TransferShares(_from, _to, _sharesAmount);
	}
}
