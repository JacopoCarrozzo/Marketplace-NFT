// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev Provides a set of functions to operate with Base64 strings.
 * Modified to be compatible with Solidity 0.8.x and inline assembly constraints.
 */
library Base64 {
    string internal constant TABLE_ENCODE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    bytes internal constant TABLE_DECODE = hex"0000000000000000000000000000000000000000000000000000000000000000"
                                           hex"00000000000000000000003e0000003f3435363738393a3b3c3d000000000000"
                                           hex"00000102030405060708090a0b0c0d0e0f101112131415161718191a00000000"
                                           hex"00001b1c1d1e1f202122232425262728292a2b2c2d2e2f303132330000000000";

    /// @notice Encodes bytes to base64 string
    function encode(bytes memory data) internal pure returns (string memory) {
        if (data.length == 0) return "";

        string memory table = TABLE_ENCODE;
        uint256 encodedLen = 4 * ((data.length + 2) / 3);
        string memory result = new string(encodedLen + 32);

        assembly {
            let tablePtr := add(table, 1)
            let dataPtr := data
            let endPtr := add(dataPtr, mload(data))
            let resultPtr := add(result, 32)

            for { } lt(dataPtr, endPtr) { } {
                dataPtr := add(dataPtr, 3)
                let input := mload(sub(dataPtr, 3))
                mstore8(resultPtr,     mload(add(tablePtr, and(shr(18, input), 0x3F))))
                mstore8(add(resultPtr,1), mload(add(tablePtr, and(shr(12, input), 0x3F))))
                mstore8(add(resultPtr,2), mload(add(tablePtr, and(shr(6,  input), 0x3F))))
                mstore8(add(resultPtr,3), mload(add(tablePtr, and(input,         0x3F))))
                resultPtr := add(resultPtr, 4)
            }

            switch mod(mload(data), 3)
            case 1 {
                mstore8(sub(resultPtr, 2), 0x3d)
                mstore8(sub(resultPtr, 1), 0x3d)
            }
            case 2 {
                mstore8(sub(resultPtr, 1), 0x3d)
            }

            mstore(result, encodedLen)
        }

        return result;
    }

    /// @notice Decodes base64 string to bytes
    function decode(string memory _data) internal pure returns (bytes memory) {
        bytes memory data = bytes(_data);

        if (data.length == 0) return new bytes(0);
        require(data.length % 4 == 0, "invalid base64 input");

        bytes memory table = TABLE_DECODE;
        uint256 decodedLen = (data.length / 4) * 3;

        if (data[data.length - 1] == "=") decodedLen--;
        if (data[data.length - 2] == "=") decodedLen--;

        bytes memory result = new bytes(decodedLen);

        assembly {
            let tablePtr := add(table, 1)
            let dataPtr := data
            let endPtr := add(dataPtr, mload(data))
            let resultPtr := result

            for { } lt(dataPtr, endPtr) { } {
                let input := mload(add(dataPtr, 32))

                let output := add(
                    add(
                        shl(18, byte(0, mload(add(tablePtr, byte(0, input))))),
                        shl(12, byte(1, mload(add(tablePtr, byte(1, input))))
                    )),
                    add(
                        shl(6, byte(2, mload(add(tablePtr, byte(2, input))))),
                        byte(3, mload(add(tablePtr, byte(3, input))))
                    )
                )

                mstore8(resultPtr, byte(2, shl(240, output)))
                mstore8(add(resultPtr, 1), byte(1, shl(240, output)))
                mstore8(add(resultPtr, 2), byte(0, shl(240, output)))
                resultPtr := add(resultPtr, 3)
                dataPtr := add(dataPtr, 4)
            }
        }

        return result;
    }
}
