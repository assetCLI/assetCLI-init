import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConfigService } from "../services/config-service";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BondingCurveService } from "../services/bonding-curve-service";
import { useMcpContext } from "../utils/mcp-hooks";
import { BN, Idl } from "@coral-xyz/anchor";
import * as IDL from "../../idls/bonding_curve.json";
import { GovernanceService } from "../services/governance-service";

// Standalone Bonding Curve Tool
export function registerBondingCurveTools(server: McpServer) {
  // Get global settings of the bonding curve
  server.tool(
    "getBondingCurveGlobalInfo",
    "Get global info of the bonding curve protocol",
    {},
    async () => {
      try {
        const context = await useMcpContext({ requireWallet: true });
        if (!context.success) {
          return {
            content: [
              {
                type: "text",
                text: `${context.error}\n\nSuggestion: ${
                  context.suggestion ||
                  "Create a wallet with 'createWallet' first"
                }`,
              },
            ],
          };
        }

        const { connection, keypair } = context;
        const bondingCurveService = new BondingCurveService(
          connection,
          {
            publicKey: keypair.publicKey,
            signTransaction: async (tx) => tx,
            signAllTransactions: async (txs) => txs,
            payer: keypair,
          },
          "confirmed",
          IDL as Idl
        );

        const globalState = await bondingCurveService.getGlobalSettings();

        if (!globalState.success || !globalState.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to get global settings: ${globalState.error?.message}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text:
                "Global bonding curve settings:\n" +
                JSON.stringify(globalState.data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to get global settings: ${error}`,
            },
          ],
        };
      }
    }
  );

  // Launch a new token on the bonding curve
  server.tool(
    "launchToken",
    "Create a new token on the bonding curve",
    {
      name: z.string(),
      symbol: z.string(),
      svg: z.string().optional(),
      startTime: z.number().optional(),
      solRaiseTarget: z.number(),
      description: z.string().optional(),
      twitterHandle: z.string().optional(),
      bullishThesis: z.string().optional(),
    },
    async (options) => {
      try {
        const context = await useMcpContext({ requireWallet: true });
        if (!context.success) {
          return {
            content: [
              {
                type: "text",
                text: `${context.error}\n\nSuggestion: ${
                  context.suggestion ||
                  "Create a wallet with 'createWallet' first"
                }`,
              },
            ],
          };
        }
        // Check if SVG was provided and convert it to Buffer
        let svgBuffer: Buffer | undefined;
        if (options.svg) {
          try {
            // Convert the svg string to Buffer
            svgBuffer = Buffer.from(options.svg);
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to process SVG: ${error}`,
                },
              ],
            };
          }
        }
        const { connection, keypair } = context;
        const bondingCurveService = new BondingCurveService(
          connection,
          {
            publicKey: keypair.publicKey,
            signTransaction: async (tx) => tx,
            signAllTransactions: async (txs) => txs,
            payer: keypair,
          },
          "confirmed",
          IDL as Idl
        );

        // Create a namespace realm
        const daoNamespace = `assetCLI-${options.name}-${options.symbol}`;
        const realmCreationRes = await GovernanceService.initializeDAO(
          connection,
          keypair,
          daoNamespace,
          [keypair.publicKey],
          1
        );

        if (!realmCreationRes.success || !realmCreationRes.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create Realm namespace: ${realmCreationRes.error?.message}`,
              },
            ],
          };
        }
        const realmPubkey = realmCreationRes.data.realmAddress;
        // Set start time to at least 2 minutes in the future
        const startTime =
          options.startTime || Math.floor(Date.now() / 1000) + 120;

        // Convert SOL to lamports for solRaiseTarget
        const solRaiseTarget = new BN(
          options.solRaiseTarget * LAMPORTS_PER_SOL
        );

        // Create the bonding curve
        const tx = await bondingCurveService.createBondingCurve({
          name: options.name,
          symbol: options.symbol,
          startTime: startTime,
          solRaiseTarget: solRaiseTarget,
          daoName: options.name,
          buff: svgBuffer || Buffer.from(""),
          daoDescription:
            options.description ||
            `A realm created for ${options.name} using AssetCLI`,
          realmAddress: realmPubkey,
          twitterHandle: options.twitterHandle,
          bullishThesis: options.bullishThesis || "Bullish thesis",
        });

        if (!tx.success || !tx.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create bonding curve: ${
                  tx.error?.message || tx.error
                }`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text:
                "Token created successfully on bonding curve!\n\n" +
                `Transaction signature: ${tx.data.tx}\n` +
                `Mint address: ${tx.data.mintAddress}\n\n` +
                "What's next?\n" +
                "1. Share the mint address with others who want to participate\n" +
                "2. Use 'swapTokens' to buy or sell tokens\n" +
                "3. Use 'getBondingCurveInfo' to check the current curve status",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create bonding curve token: ${error}`,
            },
          ],
        };
      }
    }
  );

  // Swap tokens (buy or sell)
  server.tool(
    "swapTokens",
    "Buy or sell tokens using the bonding curve",
    {
      mint: z.string(),
      direction: z.enum(["buy", "sell"]),
      amount: z.number(),
      minOut: z.number().optional(),
    },
    async (options) => {
      try {
        const context = await useMcpContext({ requireWallet: true });
        if (!context.success) {
          return {
            content: [
              {
                type: "text",
                text: `${context.error}\n\nSuggestion: ${
                  context.suggestion ||
                  "Create a wallet with 'createWallet' first"
                }`,
              },
            ],
          };
        }

        const { connection, keypair } = context;
        const bondingCurveService = new BondingCurveService(
          connection,
          {
            publicKey: keypair.publicKey,
            signTransaction: async (tx) => tx,
            signAllTransactions: async (txs) => txs,
            payer: keypair,
          },
          "confirmed",
          IDL as Idl
        );

        // Parse mint address
        let mintPubkey;
        try {
          mintPubkey = new PublicKey(options.mint);
        } catch (e) {
          return {
            content: [{ type: "text", text: "Invalid mint address." }],
          };
        }

        // Convert parameters to correct format
        const isBaseIn = options.direction === "buy";
        const amount = new BN(options.amount * LAMPORTS_PER_SOL);
        const minOut = options.minOut
          ? new BN(options.minOut * LAMPORTS_PER_SOL)
          : new BN(0);

        // Get current bonding curve data for reference
        const beforeData = await bondingCurveService.getBondingCurve(
          mintPubkey
        );

        // Execute the swap
        const tx = await bondingCurveService.swap(mintPubkey, {
          baseIn: isBaseIn,
          amount: amount,
          minOutAmount: minOut,
        });

        if (!tx.success || !tx.data) {
          return {
            content: [
              {
                type: "text",
                text: `Swap failed: ${tx.error?.message || tx.error}`,
              },
            ],
          };
        }

        // Get updated data
        const afterData = await bondingCurveService.getBondingCurve(mintPubkey);

        // Format for display
        let beforeReserves, afterReserves;
        if (beforeData.success && afterData.success) {
          beforeReserves = {
            tokens: beforeData.data.realTokenReserves
              .div(new BN(1_000_000))
              .toString(),
            sol: beforeData.data.realSolReserves
              .div(new BN(LAMPORTS_PER_SOL))
              .toString(),
          };

          afterReserves = {
            tokens: afterData.data.realTokenReserves
              .div(new BN(1_000_000))
              .toString(),
            sol: afterData.data.realSolReserves
              .div(new BN(LAMPORTS_PER_SOL))
              .toString(),
          };
        }

        return {
          content: [
            {
              type: "text",
              text:
                `${options.direction.toUpperCase()} executed successfully!\n\n` +
                `Transaction signature: ${tx.data}\n\n` +
                "Bonding curve reserves change:\n" +
                `BEFORE - SOL: ${beforeReserves?.sol || "N/A"}, Tokens: ${
                  beforeReserves?.tokens || "N/A"
                }\n` +
                `AFTER  - SOL: ${afterReserves?.sol || "N/A"}, Tokens: ${
                  afterReserves?.tokens || "N/A"
                }`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to execute swap: ${error}`,
            },
          ],
        };
      }
    }
  );

  // Get bonding curve information
  server.tool(
    "getBondingCurveInfo",
    "Get information about a specific bonding curve",
    {
      mint: z.string(),
    },
    async (options) => {
      try {
        const context = await useMcpContext({ requireWallet: true });
        if (!context.success) {
          return {
            content: [
              {
                type: "text",
                text: `${context.error}\n\nSuggestion: ${
                  context.suggestion ||
                  "Create a wallet with 'createWallet' first"
                }`,
              },
            ],
          };
        }

        const { connection, keypair } = context;
        const bondingCurveService = new BondingCurveService(
          connection,
          {
            publicKey: keypair.publicKey,
            signTransaction: async (tx) => tx,
            signAllTransactions: async (txs) => txs,
            payer: keypair,
          },
          "confirmed",
          IDL as Idl
        );

        // Parse mint address
        let mintPubkey;
        try {
          mintPubkey = new PublicKey(options.mint);
        } catch (e) {
          return {
            content: [{ type: "text", text: "Invalid mint address." }],
          };
        }

        // Get bonding curve data
        const bondingCurveData = await bondingCurveService.getBondingCurve(
          mintPubkey
        );

        if (!bondingCurveData.success || !bondingCurveData.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to get bonding curve data: ${bondingCurveData.error?.message}`,
              },
            ],
          };
        }

        // Get DAO proposal data if available
        const daoProposalData = await bondingCurveService.getDaoProposal(
          mintPubkey
        );

        // Format the data for display
        const data = bondingCurveData.data;
        const formattedData = {
          mint: mintPubkey.toString(),
          name: data.name,
          symbol: data.symbol,
          tokenDecimals: data.tokenDecimals,
          realTokenReserves: data.realTokenReserves.toString(),
          realSolReserves: data.realSolReserves.toString(),
          virtualTokenReserves: data.virtualTokenReserves.toString(),
          virtualSolReserves: data.virtualSolReserves.toString(),
          startTime: data.startTime.toString(),
          solRaiseTarget: data.solRaiseTarget.toString(),
          creator: data.creator.toString(),
          createdAt: data.createdAt.toString(),
        };

        // Add DAO proposal data if available
        let daoProposalInfo = "";
        if (daoProposalData.success && daoProposalData.data) {
          daoProposalInfo =
            "\n\nDAO Proposal Info:\n" +
            JSON.stringify(daoProposalData.data, null, 2);
        }

        return {
          content: [
            {
              type: "text",
              text:
                "Bonding Curve Info:\n" +
                JSON.stringify(formattedData, null, 2) +
                daoProposalInfo +
                "\n\nAvailable actions:\n" +
                "1. Buy tokens with 'swapTokens' direction='buy'\n" +
                "2. Sell tokens with 'swapTokens' direction='sell'",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to get bonding curve info: ${error}`,
            },
          ],
        };
      }
    }
  );

  server.prompt(
    "getPriceInfo",
    "Get price for the given mint address",
    {
      mint: z.string(),
    },
    async ({ mint }) => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Get price for the given mint address ${mint}, by looking up the bonding curve info for the mint address and calculating the price based on the reserves and the amount of tokens in circulation.`,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "getAllTokensOnCurve",
    "Tokens available for sale on the curve",
    {},
    async ({}) => {
      const context = await useMcpContext({ requireWallet: true });
      if (!context.success) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `${context.error}\n\nSuggestion: ${
                  context.suggestion ||
                  "Create a wallet with 'createWallet' first"
                }`,
              },
            },
          ],
        };
      }

      const { connection, keypair } = context;
      const bondingCurveService = new BondingCurveService(
        connection,
        {
          publicKey: keypair.publicKey,
          signTransaction: async (tx) => tx,
          signAllTransactions: async (txs) => txs,
          payer: keypair,
        },
        "confirmed",
        IDL as Idl
      );

      const allTokens = await bondingCurveService.getTokensOnCurve();
      if (!allTokens.success || !allTokens.data) {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Failed to get tokens on curve: ${allTokens.error?.message}`,
              },
            },
          ],
        };
      }
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Tokens available for sale on the curve: ${JSON.stringify(
                allTokens.data,
                null,
                2
              )}\n
              \n Availabale Actions:\n 
              1. Buy tokens with 'swapTokens' direction='buy'\n
              2. Sell tokens with 'swapTokens' direction='sell',
              `,
            },
          },
        ],
      };
    }
  );

  server.tool(
    "getTokenHoldings",
    "Get token holdings of the wallet address",
    {},
    async ({}) => {
      const context = await useMcpContext({ requireWallet: true });
      if (!context.success) {
        return {
          content: [
            {
              type: "text",
              text: `${context.error}\n\nSuggestion: ${
                context.suggestion ||
                "Create a wallet with 'createWallet' first"
              }`,
            },
          ],
        };
      }

      const { connection, keypair } = context;
      try {
        // Get token accounts owned by the user
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          keypair.publicKey,
          {
            programId: new PublicKey(
              "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
            ),
          }
        );

        if (!tokenAccounts || tokenAccounts.value.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No token holdings found for this wallet.",
              },
            ],
          };
        }

        // Get the bonding curve service
        const bondingCurveService = new BondingCurveService(
          connection,
          {
            publicKey: keypair.publicKey,
            signTransaction: async (tx) => tx,
            signAllTransactions: async (txs) => txs,
            payer: keypair,
          },
          "confirmed",
          IDL as Idl
        );

        // Get all tokens on curve for reference
        const curveTokensResponse =
          await bondingCurveService.getTokensOnCurve();
        const curveTokensMap = new Map();

        if (curveTokensResponse.success && curveTokensResponse.data) {
          curveTokensResponse.data.forEach((token) => {
            curveTokensMap.set(token.mintAddress, {
              name: token.daoProposal.name,
              symbol: token,
            });
          });
        }

        // Process token accounts
        const bondingCurveHoldings = [];
        const otherTokens = [];

        for (const account of tokenAccounts.value) {
          const parsedInfo = account.account.data.parsed.info;
          const tokenAmount = parsedInfo.tokenAmount;
          const mintAddress = parsedInfo.mint;

          // Skip tokens with zero balance
          if (tokenAmount.uiAmount <= 0) {
            continue;
          }

          const tokenInfo = curveTokensMap.get(mintAddress);
          const tokenData = {
            mint: mintAddress,
            tokenAccount: account.pubkey.toString(),
            amount: tokenAmount.uiAmount,
            decimals: tokenAmount.decimals,
            name: tokenInfo?.name || "Unknown",
            symbol: tokenInfo?.symbol || "UNKNOWN",
          };

          if (tokenInfo) {
            bondingCurveHoldings.push(tokenData);
          } else {
            otherTokens.push(tokenData);
          }
        }

        // Sort by amount
        bondingCurveHoldings.sort((a, b) => b.amount - a.amount);
        otherTokens.sort((a, b) => b.amount - a.amount);

        const allHoldings = {
          bondingCurveTokens: bondingCurveHoldings,
          otherTokens: otherTokens,
        };

        return {
          content: [
            {
              type: "text",
              text:
                bondingCurveHoldings.length > 0 || otherTokens.length > 0
                  ? `Token Holdings:\n${JSON.stringify(
                      allHoldings,
                      null,
                      2
                    )}\n\nAvailable actions:\n1. Use 'swapTokens' to sell bonding curve tokens back to the curve\n2. Use 'getBondingCurveInfo' to check curve status for bonding curve tokens`
                  : "No tokens with non-zero balances found for this wallet.",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to get token holdings: ${error}`,
            },
          ],
        };
      }
    }
  );
}
