// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IRiskModel.sol";

contract USTPController is AccessControl {
	bytes32 public constant GOV_ROLE = keccak256("GOV_ROLE");

	mapping(address => bool) public ustpVault;
	// Vault -> RiskModel
	mapping(address => IRiskModel) public vaultRiskModel;

	uint256 public USTPMaxCap;

	event NewUSTPVault(address vault, bool isActivate);
	event NewVaultRiskModel(address vault, address riskModel);
	event NewUSTPCap(uint256 newCap);

	constructor(address _gov) {
		_setupRole(DEFAULT_ADMIN_ROLE, _gov);
		_setupRole(GOV_ROLE, _gov);
	}

	/**
	 * @dev Control the activation of a minter for USTP.
	 */
	function setUSTPMinter(address _vault, bool isActive) external onlyRole(GOV_ROLE) {
		ustpVault[_vault] = isActive;
		emit NewUSTPVault(_vault, isActive);
	}

	function setVaultRiskModel(address vault, address riskModel) external onlyRole(GOV_ROLE) {
		vaultRiskModel[vault] = IRiskModel(riskModel);
		emit NewVaultRiskModel(vault, riskModel);
	}

	/**
	 * @dev Set the cap of USTP.
	 */
	function setUSTPCap(uint256 _newCap) external onlyRole(GOV_ROLE) {
		USTPMaxCap = _newCap;
		emit NewUSTPCap(_newCap);
	}

	function checkMintRisk(address vault) external view returns (bool) {
		return vaultRiskModel[vault].mintCheck();
	}

	function checkBurnRisk(address vault) external view returns (bool) {
		return vaultRiskModel[vault].burnCheck();
	}

	function isUSTPVault(address _vault) external view returns (bool) {
		return ustpVault[_vault];
	}

	function getUSTPCap() external view returns (uint256) {
		return USTPMaxCap;
	}
}
