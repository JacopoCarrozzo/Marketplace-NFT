// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; // O una versione compatibile con la tua installazione di OpenZeppelin

/**
 * @dev Provides counters that can only be incremented, decremented or reset. This can be used e.g. to track the number
 * of elements in a collection, or the number of an ID to assign to the next element.
 *
 * This library provides an array of `uint256` members that can be used to store a counter.
 * The library doesn't contain any mutex or locking mechanisms, so the caller is responsible
 * for ensuring thread-safe access to the counter in a multi-threaded environment.
 *
 * Counters are an abstraction over `uint256` that offers a safer way to
 * work with incrementing/decrementing values. This library prevents overflow
 * and underflow errors, which can be critical for smart contracts.
 */
library Counters {
    struct Counter {
        // This is a struct that will hold the actual counter value.
        // It's a simple uint256 under the hood.
        uint256 _value;
    }

    /**
     * @dev Returns the current value of the counter.
     */
    function current(Counter storage counter) internal view returns (uint256) {
        return counter._value;
    }

    /**
     * @dev Increments the counter by 1.
     *
     * Counter operations can be atomic, so no need for explicit locks,
     * but be aware of reentrancy attacks in a multi-contract setup.
     */
    function increment(Counter storage counter) internal {
        unchecked {
            counter._value += 1;
        }
    }

    /**
     * @dev Decrements the counter by 1.
     *
     * This function will revert if the counter is already at zero.
     * Use this with caution, as it can cause unexpected revert errors if the counter is not properly managed.
     */
    function decrement(Counter storage counter) internal {
        // We cannot use `unchecked` here, because it could lead to an integer underflow.
        // The check `counter._value > 0` ensures that the counter does not go below zero.
        require(counter._value > 0, "Counter: decrement overflow");
        unchecked {
            counter._value -= 1;
        }
    }

    /**
     * @dev Resets the counter to 0.
     */
    function reset(Counter storage counter) internal {
        counter._value = 0;
    }
}