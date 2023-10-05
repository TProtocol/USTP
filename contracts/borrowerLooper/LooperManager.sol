// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "../interfaces/IrUSTPool.sol";

contract LooperManager is
	AccessControlUpgradeable,
	PausableUpgradeable,
	ReentrancyGuardUpgradeable
{
	using SafeMathUpgradeable for uint256;
	using SafeERC20Upgradeable for IERC20Upgradeable;

	bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
	bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
	bytes32 public constant DEPOSITOR_ROLE = keccak256("DEPOSITOR_ROLE");

	IERC20Upgradeable public stbt;

	address public curvePool;
	IrUSTPool public rustpool;

	// Used to record the user's STBT shares.
	mapping(address => uint256) public depositedSharesSTBT;
	// Used to record the user's loan shares of rUSTP.
	mapping(address => uint256) public borrowedShares;

	function initialize(address _admin, address _rustpool) public initializer {
		__AccessControl_init();
		__Pausable_init();
		__ReentrancyGuard_init();

		_setupRole(DEFAULT_ADMIN_ROLE, _admin);
		_setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
		_setRoleAdmin(MANAGER_ROLE, ADMIN_ROLE);

		_setupRole(ADMIN_ROLE, _admin);
		_setupRole(MANAGER_ROLE, _admin);

		rustpool = IrUSTPool(_rustpool);
	}

	function setCuverPool(address _cuverPool) external onlyRole(MANAGER_ROLE) {
		require(_cuverPool != address(0), "target address not be zero.");
		curvePool = _cuverPool;
	}

	function depostSTBT(uint256 amount) external onlyRole(DEPOSITOR_ROLE) {
		stbt.safeTransferFrom(msg.sender, address(this), amount);
		stbt.safeApprove(address(rustpool), type(uint256).max);
	}

	function withdrawSTBT() external onlyRole(DEPOSITOR_ROLE) {}

	function loopBorrow() external onlyRole(MANAGER_ROLE) {}
}
