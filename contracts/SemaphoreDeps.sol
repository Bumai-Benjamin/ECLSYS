// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Deploys nothing itself: it makes Truffle compile Semaphore, its proof
// verifier and the Poseidon library, so the migration can deploy them (ANON-0).
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
