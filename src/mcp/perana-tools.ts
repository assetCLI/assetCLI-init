import { PublicKey } from "@solana/web3.js";
import { useMcpContext, mcpError, mcpText } from "../utils/mcp-hooks";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { PeranaService, SwapParams } from "../services/perana-service";
import { PRODUCTION_POOLS } from "@perena/numeraire-sdk";

// Helper function to get context and PeranaService setup
async function getContext() {
  const context = await useMcpContext({
    requireWallet: true,
    requireConfig: true,
  });

  if (
    !context.success ||
    !context.config ||
    !context.connection ||
    !context.keypair
  ) {
    return {
      success: false,
      error: context.error,
      suggestion: context.suggestion,
    };
  }

  return {
    success: true,
    connection: context.connection,
    keypair: context.keypair,
  };
}

export function registerPeranaTools(server: McpServer) {
  peranaTools.forEach((tool) => {
    server.tool(tool.name, tool.description, tool.schema, tool.func);
  });

  server.prompt(
    "perana-swap",
    "Swap tokens using Perana Numeraire",
    {
      pool: z
        .string()
        .describe("Pool name or address (e.g. 'susd', 'tripool')"),
      inToken: z.string().describe("Input token index or mint address"),
      outToken: z.string().describe("Output token index or mint address"),
      amount: z.string().describe("Amount to swap"),
      slippage: z
        .string()
        .optional()
        .describe("Slippage percentage (default: 1%)"),
    },
    (args: any) => {
      const { pool, inToken, outToken, amount, slippage } = args;
      const amountNumber = parseFloat(amount);
      const slippagePercent = slippage ? parseFloat(slippage) : 1;
      const minOutAmount = amountNumber * (1 - slippagePercent / 100);

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Execute a swap on Perana with: pool "${pool}", inToken ${inToken}, outToken ${outToken}, exactAmountIn ${amountNumber}, minAmountOut ${minOutAmount}`,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "perana-add-liquidity",
    "Add liquidity to Perana pool",
    {
      pool: z
        .string()
        .describe("Pool name or address (e.g. 'susd', 'tripool')"),
      amounts: z.string().describe("Comma-separated amounts for each token"),
      minLpAmount: z
        .string()
        .optional()
        .describe("Minimum LP tokens to receive"),
    },
    (args: any) => {
      const { pool, amounts, minLpAmount } = args;
      const amountsArray = amounts
        .split(",")
        .map((a: string) => parseFloat(a.trim()));
      const minLp = minLpAmount ? parseFloat(minLpAmount) : 1;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Add liquidity to Perana pool "${pool}" with amounts [${amountsArray.join(
                ", "
              )}] and minimum LP tokens ${minLp}`,
            },
          },
        ],
      };
    }
  );
}

export const peranaTools = [
  {
    name: "peranaListPools",
    description: "List all available Perana Numeraire pools",
    schema: {},
    async func() {
      try {
        const poolsResult = PeranaService.getAvailablePools();
        if (!poolsResult.success || !poolsResult.data) {
          return mcpError(
            "Failed to get pools information",
            "Please try again or check your network connection"
          );
        }

        const pools = poolsResult.data;
        let formattedResponse = "📊 **Available Perana Pools**\n\n";

        for (const [name, address] of Object.entries(pools)) {
          formattedResponse += `- **${name}**: \`${address}\`\n`;
        }

        formattedResponse +=
          "\nUse the pool name or address with other Perana commands.";
        return mcpText(formattedResponse);
      } catch (error: any) {
        return mcpError(
          `Failed to list pools: ${error.message}`,
          "Please try again or check your network connection"
        );
      }
    },
  },
  {
    name: "peranaSwap",
    description: "Swap tokens using Perana Numeraire pools",
    schema: {
      pool: z
        .string()
        .describe("Pool name or address (e.g. 'susd', 'tripool')"),
      inToken: z
        .union([z.number(), z.string()])
        .describe("Input token index or mint address"),
      outToken: z
        .union([z.number(), z.string()])
        .describe("Output token index or mint address"),
      exactAmountIn: z
        .number()
        .describe("Exact amount of input tokens to swap"),
      minAmountOut: z
        .number()
        .describe("Minimum amount of output tokens to receive"),
      cuLimit: z
        .number()
        .optional()
        .default(1500000)
        .describe("Compute unit limit (default: 1,500,000)"),
    },
    async func(arg: any) {
      const args: SwapParams = {
        exactAmountIn: arg.exactAmountIn,
        inToken: arg.inToken,
        outToken: arg.outToken,
        minAmountOut: arg.minAmountOut,
        pool: arg.pool,
        cuLimit: arg.cuLimit,
      };
      const contextResult = await getContext();
      if (
        !contextResult.success ||
        !contextResult.connection ||
        !contextResult.keypair
      ) {
        return mcpError(contextResult.error!, contextResult.suggestion);
      }

      const { connection, keypair } = contextResult;

      try {
        // Parse pool address if it's a named pool
        let poolAddress: PublicKey;
        if (typeof args.pool === "string" && args.pool in PRODUCTION_POOLS) {
          poolAddress = new PublicKey(
            PRODUCTION_POOLS[args.pool as keyof typeof PRODUCTION_POOLS]
          );
        } else {
          try {
            poolAddress = new PublicKey(args.pool);
          } catch (e) {
            return mcpError(
              `Invalid pool identifier: ${args.pool}`,
              "Provide a valid pool name (e.g. 'susd') or a valid Solana address"
            );
          }
        }

        // Execute the swap
        const swapResult = await PeranaService.swap(
          connection,
          {
            ...args,
            pool: poolAddress,
          },
          keypair
        );

        if (!swapResult.success) {
          return mcpError(
            `Swap failed: ${swapResult.error?.message}`,
            "Check your token balances and parameters"
          );
        }

        return mcpText(
          `✅ Swap completed successfully!\n\n` +
            `💱 Swapped ${args.exactAmountIn} tokens (index/mint: ${args.inToken}) for at least ${args.minAmountOut} tokens (index/mint: ${args.outToken})\n` +
            `🔗 Transaction: ${swapResult.data}\n\n` +
            `What's next?\n` +
            `• View your token balance with 'showWallet'\n` +
            `• Add liquidity to a pool with 'peranaAddLiquidity'\n` +
            `• Remove liquidity with 'peranaRemoveLiquidity'`
        );
      } catch (error: any) {
        return mcpError(
          `Failed to execute swap: ${error.message}`,
          "Please check your parameters and try again"
        );
      }
    },
  },
  {
    name: "peranaAddLiquidity",
    description: "Add liquidity to a Perana Numeraire pool",
    schema: {
      pool: z
        .string()
        .describe("Pool name or address (e.g. 'susd', 'tripool')"),
      maxAmountsIn: z
        .array(z.number())
        .describe("Maximum amounts of each token to add as liquidity"),
      minLpTokenMintAmount: z
        .number()
        .default(1)
        .describe("Minimum LP token amount to receive"),
      takeSwaps: z
        .boolean()
        .optional()
        .default(false)
        .describe("Allow taking swaps during adding liquidity"),
    },
    async func(args: {
      pool: string;
      maxAmountsIn: number[];
      minLpTokenMintAmount: number;
      takeSwaps?: boolean;
    }) {
      const contextResult = await getContext();
      if (
        !contextResult.success ||
        !contextResult.connection ||
        !contextResult.keypair
      ) {
        return mcpError(contextResult.error!, contextResult.suggestion);
      }

      const { connection, keypair } = contextResult;

      try {
        // Parse pool address
        let poolAddress: PublicKey;
        if (args.pool in PRODUCTION_POOLS) {
          poolAddress = new PublicKey(
            PRODUCTION_POOLS[args.pool as keyof typeof PRODUCTION_POOLS]
          );
        } else {
          try {
            poolAddress = new PublicKey(args.pool);
          } catch (e) {
            return mcpError(
              `Invalid pool identifier: ${args.pool}`,
              "Provide a valid pool name (e.g. 'susd') or a valid Solana address"
            );
          }
        }

        // Execute add liquidity
        const result = await PeranaService.addLiquidity(connection, keypair, {
          pool: poolAddress,
          maxAmountsIn: args.maxAmountsIn,
          minLpTokenMintAmount: args.minLpTokenMintAmount,
          takeSwaps: args.takeSwaps ?? false,
        });

        if (!result.success) {
          return mcpError(
            `Failed to add liquidity: ${result.error?.message}`,
            "Check your token balances and parameters"
          );
        }

        return mcpText(
          `✅ Successfully added liquidity to ${args.pool}!\n\n` +
            `💰 Amounts: [${args.maxAmountsIn.join(", ")}]\n` +
            `🧾 Minimum LP tokens: ${args.minLpTokenMintAmount}\n` +
            `🔗 Transaction: ${result.data}\n\n` +
            `What's next?\n` +
            `• View your token balance with 'showWallet'\n` +
            `• Remove liquidity with 'peranaRemoveLiquidity'\n` +
            `• Swap tokens with 'peranaSwap'`
        );
      } catch (error: any) {
        return mcpError(
          `Failed to add liquidity: ${error.message}`,
          "Please check your parameters and try again"
        );
      }
    },
  },
  {
    name: "peranaRemoveLiquidity",
    description: "Remove liquidity from a Perana Numeraire pool",
    schema: {
      pool: z
        .string()
        .describe("Pool name or address (e.g. 'susd', 'tripool')"),
      lpTokenRedeemAmount: z.number().describe("Amount of LP tokens to redeem"),
    },
    async func(args: { pool: string; lpTokenRedeemAmount: number }) {
      const contextResult = await getContext();
      if (
        !contextResult.success ||
        !contextResult.connection ||
        !contextResult.keypair
      ) {
        return mcpError(contextResult.error!, contextResult.suggestion);
      }

      const { connection, keypair } = contextResult;

      try {
        // Parse pool address
        let poolAddress: PublicKey;
        if (args.pool in PRODUCTION_POOLS) {
          poolAddress = new PublicKey(
            PRODUCTION_POOLS[args.pool as keyof typeof PRODUCTION_POOLS]
          );
        } else {
          try {
            poolAddress = new PublicKey(args.pool);
          } catch (e) {
            return mcpError(
              `Invalid pool identifier: ${args.pool}`,
              "Provide a valid pool name (e.g. 'susd') or a valid Solana address"
            );
          }
        }

        // Execute remove liquidity
        const result = await PeranaService.removeLiquidity(
          connection,
          keypair,
          {
            pool: poolAddress,
            lpTokenRedeemAmount: args.lpTokenRedeemAmount,
          }
        );

        if (!result.success) {
          return mcpError(
            `Failed to remove liquidity: ${result.error?.message}`,
            "Check your LP token balance and parameters"
          );
        }

        return mcpText(
          `✅ Successfully removed liquidity from ${args.pool}!\n\n` +
            `🔄 LP tokens redeemed: ${args.lpTokenRedeemAmount}\n` +
            `🔗 Transaction: ${result.data}\n\n` +
            `What's next?\n` +
            `• View your token balance with 'showWallet'\n` +
            `• Add liquidity back with 'peranaAddLiquidity'\n` +
            `• Swap tokens with 'peranaSwap'`
        );
      } catch (error: any) {
        return mcpError(
          `Failed to remove liquidity: ${error.message}`,
          "Please check your parameters and try again"
        );
      }
    },
  },
  {
    name: "peranaGetPoolInfo",
    description: "Get information about a specific Perana Numeraire pool",
    schema: {
      pool: z
        .string()
        .describe("Pool name or address (e.g. 'susd', 'tripool')"),
    },
    async func(args: { pool: string }) {
      try {
        // Get pool address
        let poolAddress: string;
        if (args.pool in PRODUCTION_POOLS) {
          poolAddress =
            PRODUCTION_POOLS[args.pool as keyof typeof PRODUCTION_POOLS];
        } else {
          try {
            // Validate as address
            new PublicKey(args.pool);
            poolAddress = args.pool;
          } catch (e) {
            return mcpError(
              `Invalid pool identifier: ${args.pool}`,
              "Provide a valid pool name (e.g. 'susd') or a valid Solana address"
            );
          }
        }

        // For now, just return the pool address and type
        // In a full implementation, you would fetch on-chain data about the pool
        const poolType =
          Object.entries(PRODUCTION_POOLS).find(
            ([_, address]) => address === poolAddress
          )?.[0] || "Unknown";

        return mcpText(
          `🏊 **Perana Pool Information**\n\n` +
            `📍 **Pool Address**: \`${poolAddress}\`\n` +
            `🏷️ **Pool Type**: ${poolType}\n\n` +
            `To interact with this pool:\n` +
            `• Swap tokens with 'peranaSwap'\n` +
            `• Add liquidity with 'peranaAddLiquidity'\n` +
            `• Remove liquidity with 'peranaRemoveLiquidity'`
        );
      } catch (error: any) {
        return mcpError(
          `Failed to get pool information: ${error.message}`,
          "Please check your parameters and try again"
        );
      }
    },
  },
];
