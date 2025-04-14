#!/bin/bash

echo "Moving IDL files to idl directory"
mkdir -p idls

cp "$PWD/programs/bonding-curve/target/idl/bonding_curve.json" idls/
cp "$PWD/programs/bonding-curve/target/types/bonding_curve.ts" src/types/