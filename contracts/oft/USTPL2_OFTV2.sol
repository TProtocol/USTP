// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@layerzerolabs/solidity-examples/contracts/token/oft/v2/OFTV2.sol";

contract USTP is OFTV2 {
	constructor(
		uint8 _sharedDecimals,
		address _lzEndpoint
	) OFTV2("USTP", "USTP", _sharedDecimals, _lzEndpoint) {}
}
