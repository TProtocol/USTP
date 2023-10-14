// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "../interfaces/IUSTPHelper.sol";

contract SwapRouter is AccessControl {
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

	address public rustp;
	address public iustp;
	address public ustp;
	IUSTPHelper public ustpHelper;
	address public immutable oneInchRouter;
	// recovery fund wallet
	address public recovery;

	constructor(
		address _rustp,
		address _iustp,
		address _ustp,
		address _ustpHelper,
		address _oneInchRouter,
		address _recovery
	) {
		_setupRole(ADMIN_ROLE, msg.sender);
		rustp = _rustp;
		iustp = _iustp;
		ustp = _ustp;
		ustpHelper = IUSTPHelper(_ustpHelper);
		require(_recovery != address(0), "!_recovery");
		recovery = _recovery;
		oneInchRouter = _oneInchRouter;
	}

	// swap
	function swapToTokens(
		address tokenIn,
		uint256 amountIn,
		uint256 minAmount,
		bytes calldata data
	) public returns (uint256 amountOut) {
		uint256 realAmountIn = amountIn;
		if (tokenIn == rustp || tokenIn == iustp) {
			IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), realAmountIn);
			IERC20(tokenIn).safeApprove(address(ustpHelper), realAmountIn);
			realAmountIn = tokenIn == rustp
				? ustpHelper.wraprUSTPToUSTP(amountIn)
				: ustpHelper.wrapiUSTPToUSTP(amountIn);
			tokenIn = ustp;
		} else {
			IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), realAmountIn);
		}

		IERC20(tokenIn).safeApprove(oneInchRouter, realAmountIn);
		amountOut = _swapOnOneInch(data);
		IERC20(tokenIn).safeApprove(oneInchRouter, 0);
		require(amountOut >= minAmount, "lower than minAmount");
	}

	function _swapOnOneInch(bytes memory _callData) internal returns (uint256 returnAmount) {
		(bool success, bytes memory returnData) = oneInchRouter.call(_callData);
		if (success) {
			returnAmount = abi.decode(returnData, (uint256));
		} else {
			if (returnData.length < 68) {
				revert("1Inch error");
			} else {
				assembly {
					returnData := add(returnData, 0x04)
				}
			}
		}
	}

	/**
	 * @dev Allows to recover any ERC20 token
	 * @param recover Using to receive recovery of fund
	 * @param tokenAddress Address of the token to recover
	 * @param amountToRecover Amount of collateral to transfer
	 */
	function recoverERC20(
		address recover,
		address tokenAddress,
		uint256 amountToRecover
	) external onlyRole(ADMIN_ROLE) {
		IERC20(tokenAddress).safeTransfer(recover, amountToRecover);
	}
}
