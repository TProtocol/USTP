// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "../interfaces/IrUSTPool.sol";
import "../interfaces/IiUSTP.sol";
import "../interfaces/IUSTP.sol";
import "../interfaces/IUniswapV3Pool.sol";

contract USTPHelper is AccessControl {
	using SafeERC20 for IERC20;
	using SafeMath for uint256;

	bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

	address public rustp;
	address public iustp;
	address public ustp;
	IERC20 public underlyingToken;
	address public immutable oneInchRouter;
	// recovery fund wallet
	address public recovery;

	constructor(
		address _rustp,
		address _iustp,
		address _ustp,
		address _underlyingToken,
		address _oneInchRouter,
		address _recovery
	) {
		_setupRole(ADMIN_ROLE, msg.sender);
		rustp = _rustp;
		iustp = _iustp;
		ustp = _ustp;
		underlyingToken = IERC20(_underlyingToken);
		require(_recovery != address(0), "!_recovery");
		recovery = _recovery;
		oneInchRouter = _oneInchRouter;
	}

	/**
	 * @dev Mint rUSTP
	 * @param amount the amout of underlying
	 */
	function mintrUSTP(uint256 amount) external returns (uint256) {
		address user = msg.sender;
		underlyingToken.safeTransferFrom(user, address(this), amount);
		underlyingToken.approve(rustp, amount);
		uint256 beforeAmount = IERC20(rustp).balanceOf(address(this));
		IrUSTPool(rustp).supplyUSDC(amount);
		uint256 afterAmount = IERC20(rustp).balanceOf(address(this));
		uint256 mintAmount = afterAmount.sub(beforeAmount);
		IERC20(rustp).safeTransfer(msg.sender, mintAmount);
		return mintAmount;
	}

	/**
	 * @dev Mint iUSTP
	 * @param amount the amout of underlying
	 */
	function mintiUSTP(uint256 amount) external returns (uint256) {
		address user = msg.sender;
		underlyingToken.safeTransferFrom(user, address(this), amount);
		underlyingToken.approve(rustp, amount);
		uint256 beforeAmount = IERC20(rustp).balanceOf(address(this));
		IrUSTPool(rustp).supplyUSDC(amount);
		uint256 afterAmount = IERC20(rustp).balanceOf(address(this));
		uint256 userAmount = afterAmount.sub(beforeAmount);

		IERC20(rustp).approve(iustp, userAmount);
		uint256 beforeIUSTP = IERC20(iustp).balanceOf(address(this));
		IiUSTP(iustp).wrap(userAmount);
		uint256 afterIUSTP = IERC20(iustp).balanceOf(address(this));

		uint256 mintAmount = afterIUSTP.sub(beforeIUSTP);
		IERC20(iustp).safeTransfer(msg.sender, afterIUSTP.sub(beforeIUSTP));

		return mintAmount;
	}

	/**
	 * @dev Mint USTP
	 * @param amount the amout of underlying
	 */
	function mintUSTP(uint256 amount) external returns (uint256) {
		address user = msg.sender;
		underlyingToken.safeTransferFrom(user, address(this), amount);
		underlyingToken.approve(rustp, amount);
		uint256 beforeAmount = IERC20(rustp).balanceOf(address(this));
		IrUSTPool(rustp).supplyUSDC(amount);
		uint256 afterAmount = IERC20(rustp).balanceOf(address(this));
		uint256 userAmount = afterAmount.sub(beforeAmount);

		IERC20(rustp).approve(ustp, userAmount);
		uint256 beforeUSTP = IERC20(ustp).balanceOf(address(this));
		IUSTP(ustp).deposit(userAmount);
		uint256 afterUSTP = IERC20(ustp).balanceOf(address(this));

		uint256 mintAmount = afterUSTP.sub(beforeUSTP);
		IERC20(ustp).safeTransfer(msg.sender, mintAmount);

		return mintAmount;
	}

	/**
	 * @dev Wrap iUSTP to USTP
	 * @param amount the amout of iUSTP
	 */
	function wrapiUSTPToUSTP(uint256 amount) external returns (uint256) {
		uint256 mintAmount = _wrapiUSTPToUSTP(amount);
		IERC20(ustp).safeTransfer(msg.sender, mintAmount);

		return mintAmount;
	}

	function _wrapiUSTPToUSTP(uint256 amount) internal returns (uint256) {
		address user = msg.sender;
		uint256 beforerUSTP = IERC20(rustp).balanceOf(address(this));
		IERC20(iustp).safeTransferFrom(user, address(this), amount);
		IiUSTP(iustp).unwrap(amount);
		uint256 afterrUSTP = IERC20(rustp).balanceOf(address(this));

		uint256 userrUSTPAmount = afterrUSTP.sub(beforerUSTP);

		IERC20(rustp).approve(ustp, userrUSTPAmount);
		uint256 beforeUSTP = IERC20(ustp).balanceOf(address(this));
		IUSTP(ustp).deposit(userrUSTPAmount);

		uint256 afterUSTP = IERC20(ustp).balanceOf(address(this));

		uint256 mintAmount = afterUSTP.sub(beforeUSTP);

		return mintAmount;
	}

	/**
	 * @dev Wrap rUSTP to USTP
	 * @param amount the amout of rUSTP
	 */
	function wraprUSTPToUSTP(uint256 amount) external returns (uint256) {
		uint256 mintAmount = _wraprUSTPToUSTP(amount);
		IERC20(ustp).safeTransfer(msg.sender, mintAmount);
		return mintAmount;
	}

	function _wraprUSTPToUSTP(uint256 amount) internal returns (uint256) {
		address user = msg.sender;
		IERC20(rustp).safeTransferFrom(user, address(this), amount);

		IERC20(rustp).approve(ustp, amount);
		uint256 beforeUSTP = IERC20(ustp).balanceOf(address(this));
		IUSTP(ustp).deposit(amount);

		uint256 afterUSTP = IERC20(ustp).balanceOf(address(this));

		uint256 mintAmount = afterUSTP.sub(beforeUSTP);
		return mintAmount;
	}

	/**
	 * @dev Wrap USTP to iUSTP
	 * @param amount the amout of USTP
	 */
	function wrapUSTPToiUSTP(uint256 amount) external returns (uint256) {
		uint256 mintAmount = _wrapUSTPToiUSTP(amount);
		IERC20(iustp).safeTransfer(msg.sender, mintAmount);
		return mintAmount;
	}

	function _wrapUSTPToiUSTP(uint256 amount) internal returns (uint256) {
		address user = msg.sender;
		uint256 beforerUSTP = IERC20(rustp).balanceOf(address(this));
		IERC20(ustp).safeTransferFrom(user, address(this), amount);
		IUSTP(ustp).withdraw(amount);
		uint256 afterrUSTP = IERC20(rustp).balanceOf(address(this));
		uint256 userrUSTPAmount = afterrUSTP.sub(beforerUSTP);

		IERC20(rustp).approve(iustp, userrUSTPAmount);

		uint256 beforeIUSTP = IERC20(iustp).balanceOf(address(this));
		IiUSTP(iustp).wrap(userrUSTPAmount);
		uint256 afterIUSTP = IERC20(iustp).balanceOf(address(this));

		uint256 mintAmount = afterIUSTP.sub(beforeIUSTP);

		return mintAmount;
	}

	// swap
	function swapToTokens(
		address tokenIn,
		uint256 amountIn,
		uint256 minAmount,
		bytes calldata data
	) public returns (uint256 amountOut) {
		require(tokenIn == rustp || tokenIn == iustp || tokenIn == ustp, "f");
		uint256 realAmountIn = amountIn;
		if (tokenIn == rustp) {
			realAmountIn = _wraprUSTPToUSTP(amountIn);
		} else if (tokenIn == iustp) {
			realAmountIn = _wrapiUSTPToUSTP(amountIn);
		} else {
			IERC20(ustp).safeTransferFrom(msg.sender, address(this), realAmountIn);
		}

		IERC20(ustp).safeApprove(oneInchRouter, realAmountIn);
		amountOut = _swapOnOneInch(data);
		IERC20(ustp).safeApprove(oneInchRouter, 0);
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
