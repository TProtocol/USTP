// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IRiskModel {
	function mintCheck() external view returns (bool);

	function burnCheck() external view returns (bool);
}
