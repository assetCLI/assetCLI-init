#!/bin/bash

GOVERNACE_PROGRAM=GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw
STAKE_PROGRAM=BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr
SQUAD_PROGRAM=SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf
METADATA_PROGRAM=metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s

echo "Starting local devnet"

solana-test-validator --quiet --reset --clone-upgradeable-program $GOVERNACE_PROGRAM $SQUAD_PROGRAM $METADATA_PROGRAM --clone $STAKE_PROGRAM --url devnet &