/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/bonding_curve.json`.
 */
export type BondingCurve = {
  "address": "C2LfjaKea6KJ15zXDzxghTSErN6xEqUnHzpg2Vrpdjnu",
  "metadata": {
    "name": "bondingCurve",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "createBondingCurve",
      "discriminator": [
        94,
        139,
        158,
        50,
        69,
        95,
        8,
        45
      ],
      "accounts": [
        {
          "name": "mint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  99,
                  117,
                  114,
                  118,
                  101,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "params.name"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "bondingCurve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "daoProposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111,
                  95,
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "bondingCurveTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bondingCurve"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "metadata",
          "writable": true
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "tokenMetadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createBondingCurveParams"
            }
          }
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "globalSettingsInput"
            }
          }
        }
      ]
    },
    {
      "name": "swap",
      "discriminator": [
        248,
        198,
        158,
        145,
        225,
        117,
        135,
        200
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "feeReceiver",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "bondingCurve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "bondingCurveTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bondingCurve"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "userTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "daoProposal",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111,
                  95,
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "clock",
          "address": "SysvarC1ock11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "swapParams"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bondingCurve",
      "discriminator": [
        23,
        183,
        248,
        55,
        96,
        216,
        172,
        96
      ]
    },
    {
      "name": "daoProposal",
      "discriminator": [
        71,
        0,
        210,
        124,
        8,
        79,
        233,
        73
      ]
    },
    {
      "name": "global",
      "discriminator": [
        167,
        232,
        232,
        177,
        200,
        108,
        114,
        127
      ]
    }
  ],
  "events": [
    {
      "name": "targetReached",
      "discriminator": [
        149,
        209,
        57,
        9,
        106,
        52,
        127,
        219
      ]
    },
    {
      "name": "tokensPurchased",
      "discriminator": [
        214,
        119,
        105,
        186,
        114,
        205,
        228,
        181
      ]
    },
    {
      "name": "tokensSold",
      "discriminator": [
        217,
        83,
        68,
        137,
        134,
        225,
        94,
        45
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidGlobalAuthority",
      "msg": "Invalid Global Authority"
    },
    {
      "code": 6001,
      "name": "invalidWithdrawAuthority",
      "msg": "Invalid Withdraw Authority"
    },
    {
      "code": 6002,
      "name": "invalidArgument",
      "msg": "Invalid Argument"
    },
    {
      "code": 6003,
      "name": "alreadyInitialized",
      "msg": "Global Already Initialized"
    },
    {
      "code": 6004,
      "name": "notInitialized",
      "msg": "Global Not Initialized"
    },
    {
      "code": 6005,
      "name": "programNotRunning",
      "msg": "Not in Running State"
    },
    {
      "code": 6006,
      "name": "bondingCurveComplete",
      "msg": "Bonding Curve Complete"
    },
    {
      "code": 6007,
      "name": "bondingCurveNotComplete",
      "msg": "Bonding Curve Not Complete"
    },
    {
      "code": 6008,
      "name": "insufficientUserTokens",
      "msg": "Insufficient User Tokens"
    },
    {
      "code": 6009,
      "name": "insufficientUserSol",
      "msg": "Insufficient user SOL"
    },
    {
      "code": 6010,
      "name": "slippageExceeded",
      "msg": "Slippage Exceeded"
    },
    {
      "code": 6011,
      "name": "minSwap",
      "msg": "Swap exactInAmount is 0"
    },
    {
      "code": 6012,
      "name": "buyFailed",
      "msg": "Buy Failed"
    },
    {
      "code": 6013,
      "name": "sellFailed",
      "msg": "Sell Failed"
    },
    {
      "code": 6014,
      "name": "bondingCurveInvariant",
      "msg": "Bonding Curve Invariant Failed"
    },
    {
      "code": 6015,
      "name": "curveNotStarted",
      "msg": "Curve Not Started"
    },
    {
      "code": 6016,
      "name": "invalidStartTime",
      "msg": "Start time is in the past"
    },
    {
      "code": 6017,
      "name": "wlInitializeFailed",
      "msg": "Whitelist is already initialized"
    },
    {
      "code": 6018,
      "name": "wlNotInitializeFailed",
      "msg": "Whitelist is not initialized"
    },
    {
      "code": 6019,
      "name": "addFailed",
      "msg": "This creator already in whitelist"
    },
    {
      "code": 6020,
      "name": "removeFailed",
      "msg": "This creator is not in whitelist"
    },
    {
      "code": 6021,
      "name": "wlNotInitialized",
      "msg": "The WL account is not initialized"
    },
    {
      "code": 6022,
      "name": "notWhiteList",
      "msg": "This creator is not in whitelist"
    },
    {
      "code": 6023,
      "name": "notCompleted",
      "msg": "Bonding curve is not completed"
    },
    {
      "code": 6024,
      "name": "notBondingCurveMint",
      "msg": "This token is not a bonding curve token"
    },
    {
      "code": 6025,
      "name": "notSol",
      "msg": "Not quote mint"
    },
    {
      "code": 6026,
      "name": "invalidConfig",
      "msg": "Not equel config"
    },
    {
      "code": 6027,
      "name": "arithmeticError",
      "msg": "Arithmetic Error"
    },
    {
      "code": 6028,
      "name": "invalidFeeReceiver",
      "msg": "Invalid Fee Receiver"
    },
    {
      "code": 6029,
      "name": "invalidMigrationAuthority",
      "msg": "Invalid Migration Authority"
    },
    {
      "code": 6030,
      "name": "alreadyInUse",
      "msg": "Account already in use"
    },
    {
      "code": 6031,
      "name": "uninitializedAccount",
      "msg": "Account not initialized"
    },
    {
      "code": 6032,
      "name": "raiseTargetReached",
      "msg": "SOL raise target already reached"
    },
    {
      "code": 6033,
      "name": "invalidRealmAccount",
      "msg": "Invalid realm account"
    }
  ],
  "types": [
    {
      "name": "bondingCurve",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "initialVirtualTokenReserves",
            "type": "u64"
          },
          {
            "name": "virtualSolReserves",
            "type": "u64"
          },
          {
            "name": "virtualTokenReserves",
            "type": "u64"
          },
          {
            "name": "realSolReserves",
            "type": "u64"
          },
          {
            "name": "realTokenReserves",
            "type": "u64"
          },
          {
            "name": "tokenTotalSupply",
            "type": "u64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "complete",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "solRaiseTarget",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "createBondingCurveParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "startTime",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "solRaiseTarget",
            "type": "u64"
          },
          {
            "name": "daoName",
            "type": "string"
          },
          {
            "name": "daoDescription",
            "type": "string"
          },
          {
            "name": "realmAddress",
            "type": "pubkey"
          },
          {
            "name": "twitterHandle",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "discordLink",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "websiteUrl",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "logoUri",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "founderName",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "founderTwitter",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "bullishThesis",
            "type": {
              "option": "string"
            }
          }
        ]
      }
    },
    {
      "name": "daoProposal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "realmAddress",
            "type": "pubkey"
          },
          {
            "name": "twitterHandle",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "discordLink",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "websiteUrl",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "logoUri",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "founderName",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "founderTwitter",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "bullishThesis",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "global",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "programStatus"
              }
            }
          },
          {
            "name": "initialized",
            "type": "bool"
          },
          {
            "name": "globalAuthority",
            "type": "pubkey"
          },
          {
            "name": "migrateFeeAmount",
            "type": "u64"
          },
          {
            "name": "feeReceiver",
            "type": "pubkey"
          },
          {
            "name": "initialVirtualTokenReserves",
            "type": "u64"
          },
          {
            "name": "initialVirtualSolReserves",
            "type": "u64"
          },
          {
            "name": "initialRealTokenReserves",
            "type": "u64"
          },
          {
            "name": "tokenTotalSupply",
            "type": "u64"
          },
          {
            "name": "mintDecimals",
            "type": "u8"
          },
          {
            "name": "whitelistEnabled",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "globalSettingsInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "initialVirtualTokenReserves",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "initialVirtualSolReserves",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "initialRealTokenReserves",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "tokenTotalSupply",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "mintDecimals",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "migrateFeeAmount",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "feeReceiver",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "status",
            "type": {
              "option": {
                "defined": {
                  "name": "programStatus"
                }
              }
            }
          },
          {
            "name": "whitelistEnabled",
            "type": {
              "option": "bool"
            }
          }
        ]
      }
    },
    {
      "name": "programStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "running"
          },
          {
            "name": "swapOnly"
          },
          {
            "name": "swapOnlyNoLaunch"
          },
          {
            "name": "paused"
          }
        ]
      }
    },
    {
      "name": "swapParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "baseIn",
            "type": "bool"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "minOutAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "targetReached",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bondingCurve",
            "type": "pubkey"
          },
          {
            "name": "finalSolRaised",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tokensPurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bondingCurve",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "tokenAmount",
            "type": "u64"
          },
          {
            "name": "pricePerToken",
            "type": "f64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tokensSold",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bondingCurve",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "tokenAmount",
            "type": "u64"
          },
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "pricePerToken",
            "type": "f64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
