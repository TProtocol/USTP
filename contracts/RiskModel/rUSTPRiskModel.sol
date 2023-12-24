// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IRiskModel.sol";
import "../interfaces/IStaticOracle.sol";

contract rUSTPRiskModel is Ownable, IRiskModel {
	bool public mintEnable;
	bool public burnEnable;
	bool public checkEnable;

	address public UNI_V3_PAIR_ADDRESS;
	address public BASE_TOKEN;
	address public QUOTE_TOKEN;

	// Lowest price 0.99
	uint256 minPrice = 990000;
	// Highest price 1.01
	uint256 maxPrice = 1010000;

	constructor(address _pool, address _baseToken, address _quoteToken) {
		UNI_V3_PAIR_ADDRESS = _pool;
		BASE_TOKEN = _baseToken;
		QUOTE_TOKEN = _quoteToken;
	}

	function setmintEnable(bool status) external onlyOwner {
		mintEnable = status;
	}

	function setburnEnable(bool status) external onlyOwner {
		burnEnable = status;
	}

	function setCheckEnable(bool status) external onlyOwner {
		burnEnable = status;
	}

	function mintCheck() external view override returns (bool) {
		if (!checkEnable) {
			return true;
		}
		if (!mintEnable) {
			return false;
		}
		return _priceCheck();
	}

	function burnCheck() external view override returns (bool) {
		if (!checkEnable) {
			return true;
		}
		if (!burnEnable) {
			return false;
		}
		return _priceCheck();
	}

	function _priceCheck() internal view returns (bool) {
		uint256 price = getPrices();
		if (price < minPrice || price > maxPrice) {
			return false;
		}
		return true;
	}

	function getPrices() public view returns (uint256 _price) {
		address[] memory _pools = new address[](1);
		_pools[0] = UNI_V3_PAIR_ADDRESS;
		_price = IStaticOracle(0xB210CE856631EeEB767eFa666EC7C1C57738d438)
			.quoteSpecificPoolsWithTimePeriod(1e18, BASE_TOKEN, QUOTE_TOKEN, _pools, 3600);
	}
}
