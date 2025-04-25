import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useMcpContext, mcpError, mcpText } from "../utils/mcp-hooks";
import { BondingCurveService } from "../services/bonding-curve-service";
import * as anchor from "@coral-xyz/anchor";
import IDL from "../../idls/bonding_curve.json";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

async function getBondingCurveService() {
  const context = await useMcpContext({ requireWallet: true });
  if (!context.success) {
    return {
      success: false,
      error: context.error,
      suggestion: context.suggestion,
    };
  }
  try {
    // Create bonding curve service
    const wallet = new anchor.Wallet(context.keypair);
    const service = new BondingCurveService(
      context.connection,
      wallet,
      "confirmed",
      IDL as anchor.Idl
    );
    return { success: true, service, wallet };
  } catch (error) {
    return {
      success: false,
      error: `Failed to initialize bonding curve service: ${error}`,
      suggestion: "Make sure the bonding curve IDL is available",
    };
  }
}

export function registerBondingCurveTools(server: McpServer) {
  bondingCurveTools.forEach((tool) => {
    server.tool(tool.name, tool.description, tool.schema, tool.func);
  });

  server.prompt(
    "buy-sell-tokens",
    "Buy or sell tokens on bonding curve",
    {
      mintAddress: z.string().describe("Address of token mint"),
      isBuy: z
        .string()
        .describe("Type 'true' to buy tokens or 'false' to sell"),
      amount: z.string().describe("Amount to swap"),
      slippagePercent: z
        .string()
        .optional()
        .describe("Slippage tolerance percentage (e.g. 1 for 1%)"),
    },
    ({ mintAddress, isBuy, amount, slippagePercent }) => {
      const isBuyBoolean = isBuy.toLowerCase() === "true";
      const amountNumber = parseFloat(amount);
      const slippageNumber = slippagePercent
        ? parseFloat(slippagePercent)
        : 0.5;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `First simulate the swap using the \`simulateSwap\` command with: mintAddress "${mintAddress}" isBuy ${isBuyBoolean} amount ${amountNumber} slippagePercent ${slippageNumber}, ask for permission to proceed with the swap, and then execute the swap using the \`swap\` tool with: mintAddress "${mintAddress}" isBuy ${isBuyBoolean} amount ${amountNumber} slippagePercent ${slippageNumber}`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: `To execute the swap, use the \`swap\` command with: mintAddress "${mintAddress}" isBuy ${isBuyBoolean} amount ${amountNumber} slippagePercent ${slippageNumber}`,
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "migrate-to-raydium",
    "Migrate token from bonding curve to Raydium pool",
    {
      mintAddress: z.string().describe("Address of token mint"),
    },
    ({ mintAddress }) => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `First check if the bonding curve is complete using the \`getBondingCurveDetails\` tool with mint address "${mintAddress}", then migrate the token to Raydium using the \`migrateToRaydium\` tool with: mintAddress "${mintAddress}"`,
            },
          },
        ],
      };
    }
  );
}

// Function to handle buffer from base64 string (for image uploads)
function decodeBase64Image(base64String: string): Buffer {
  // Remove data URL prefix if present
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64Data, "base64");
}

export const bondingCurveTools = [
  {
    name: "initializeBondingCurve",
    description: "Initialize the bonding curve protocol",
    schema: {
      feeReceiver: z
        .string()
        .optional()
        .describe("Public key of the fee receiver (optional)"),
      migrateFeeAmount: z
        .number()
        .optional()
        .describe("Fee amount for migrations (optional)"),
    },
    async func(args: {
      feeReceiver?: string | undefined;
      migrateFeeAmount?: number | undefined;
    }) {
      const result = await getBondingCurveService();
      if (!result.success || !result.service) {
        return mcpError(result.error!, result.suggestion);
      }
      const { feeReceiver, migrateFeeAmount } = args;
      const { service } = result;

      const initParams = {
        feeReceiver: feeReceiver ? new PublicKey(feeReceiver) : undefined,
        migrateFeeAmount: migrateFeeAmount
          ? new BN(migrateFeeAmount)
          : undefined,
        status: { running: {} },
      };

      const initResult = await service.initialize(initParams);

      if (!initResult.success) {
        return mcpError(
          `Failed to initialize bonding curve: ${initResult.error?.message}`,
          "Check your connection and wallet"
        );
      }

      return mcpText(
        `Successfully initialized bonding curve protocol!\nTransaction: ${initResult.data}`
      );
    },
  },
  {
    name: "createBondingCurve",
    description:
      "Create a new token on a linear bonding curve with a sol raise target",
    schema: {
      name: z.string().describe("Token name"),
      symbol: z.string().describe("Token symbol"),
      description: z.string().describe("Token description"),
      solRaiseTarget: z
        .number()
        .describe("Sol raise target in SOL(not in lamports)"),
      image: z.string().describe("Base64 encoded image data"),
      decimals: z.number().default(9).describe("Token decimals"),
      totalSupply: z.number().describe("Total token supply"),
      twitterHandle: z
        .string()
        .optional()
        .describe("Twitter handle (optional)"),
      discordLink: z.string().optional().describe("Discord link (optional)"),
      websiteUrl: z.string().optional().describe("Website URL (optional)"),
      founderName: z.string().optional().describe("Founder name (optional)"),
      founderTwitter: z
        .string()
        .optional()
        .describe("Founder Twitter handle (optional)"),
      bullishThesis: z
        .string()
        .optional()
        .describe("Bullish thesis for token (optional)"),
    },
    async func(args: {
      name: string;
      symbol: string;
      description: string;
      solRaiseTarget: number;
      image: string;
      decimals?: number | undefined;
      totalSupply: number;
      twitterHandle?: string | undefined;
      discordLink?: string | undefined;
      websiteUrl?: string | undefined;
      founderName?: string | undefined;
      founderTwitter?: string | undefined;
      bullishThesis?: string | undefined;
    }) {
      const {
        name,
        symbol,
        description,
        solRaiseTarget,
        image,
        decimals = 9,
        totalSupply,
        twitterHandle,
        discordLink,
        websiteUrl,
        founderName,
        founderTwitter,
        bullishThesis,
      } = args;

      const result = await getBondingCurveService();
      if (!result.success || !result.service || !result.wallet) {
        return mcpError(result.error!, result.suggestion);
      }

      const { service, wallet } = result;

      // Handle image if provided
      let imageBuffer;
      if (image) {
        try {
          imageBuffer = decodeBase64Image(image);
        } catch (error) {
          return mcpError(
            `Failed to decode image: ${error}`,
            "Provide a valid base64 encoded image"
          );
        }
      }

      const createParams = {
        name,
        symbol,
        description,
        solRaiseTarget: new BN(solRaiseTarget),
        buff: imageBuffer,
        mintDecimals: decimals,
        tokenTotalSupply: new BN(totalSupply),
        treasuryAddress: wallet.publicKey,
        authorityAddress: wallet.publicKey,
        twitterHandle,
        discordLink,
        websiteUrl,
        logoUri: undefined,
        founderName,
        founderTwitter,
        bullishThesis,
      };

      const createResult = await service.createBondingCurve(createParams);

      if (!createResult.success || !createResult.data) {
        return mcpError(
          `Failed to create bonding curve: ${createResult.error?.message}`,
          "Check your input parameters and try again"
        );
      }

      return mcpText(
        `✅ Successfully created token with bonding curve!\n\nToken: ${name} (${symbol})\nMint Address: ${createResult.data.mintAddress}\nTransaction: ${createResult.data.tx}`
      );
    },
  },
  {
    name: "swap",
    description: "Swap between SOL and tokens using the bonding curve",
    schema: {
      mintAddress: z.string().describe("Address of token mint"),
      isBuy: z
        .boolean()
        .describe("True to buy tokens with SOL, False to sell tokens for SOL"),
      amount: z
        .number()
        .describe("Amount to swap (in SOL if buying, in tokens if selling)"),
      mintOutAmount: z
        .number()
        .describe(
          "Minimum output amount (provided in tokens if buying, in SOL if selling) (provided from simulateSwap)"
        ),
    },
    async func(args: {
      mintAddress: string;
      isBuy: boolean;
      amount: number;
      mintOutAmount: number;
    }) {
      const { mintAddress, isBuy, amount, mintOutAmount } = args;
      const result = await getBondingCurveService();
      if (!result.success || !result.service) {
        return mcpError(result.error!, result.suggestion);
      }

      const { service } = result;
      let mint = new PublicKey(mintAddress);
      const curveResult = await service.getBondingCurve(mint);
      if (!curveResult.success) {
        return mcpError(
          `Failed to get bonding curve data: ${curveResult.error?.message}`,
          "Check your mint address"
        );
      }
      const swapParams = {
        baseIn: !isBuy,
        amount: new BN(amount),
        minOutAmount: new BN(mintOutAmount),
      };

      const swapResult = await service.swap(mint, swapParams);

      if (!swapResult.success) {
        return mcpError(
          `Swap failed: ${swapResult.error?.message}`,
          "Check your balance and try again"
        );
      }

      const actionText = isBuy ? "bought tokens" : "sold tokens";
      return mcpText(
        `Successfully ${actionText}!\nTransaction: ${swapResult.data}`
      );
    },
  },
  {
    name: "listBondingCurves",
    description: "List all bonding curves and tokens",
    schema: {},
    async func() {
      const result = await getBondingCurveService();
      if (!result.success || !result.service) {
        return mcpError(result.error!, result.suggestion);
      }

      const { service } = result;

      const listResult = await service.fetchAllTokensAndProposalsOnCurve();

      if (
        !listResult.success ||
        !listResult.data ||
        listResult.data.length === 0
      ) {
        return mcpText("No bonding curves found.");
      }

      const formattedText = listResult.data
        .map((item, index) => {
          const curve = item.bondingCurve;
          const proposal = item.proposal;
          const metadata = item.metadata;

          return `${index + 1}. ${proposal.name}
   Complete: ${curve.complete ? "✅" : "❌"}
   Metadata: ${JSON.stringify(metadata, null, 0)}
   Name: ${proposal?.name || "N/A"}
   Description: ${proposal?.description || "N/A"}
   Website: ${proposal?.websiteUrl || "N/A"}
   Twitter: ${proposal?.twitterHandle || "N/A"}
   Discord: ${proposal?.discordLink || "N/A"}

   Founder: ${proposal?.founderName || "N/A"} ${
            proposal?.founderTwitter ? `(@${proposal.founderTwitter})` : ""
          }
    Bullish Thesis: ${proposal?.bullishThesis || "N/A"}
    Authority Address: ${proposal.authorityAddress.toBase58()}
    Token Decimals: ${curve.tokenDecimals}
    Total Supply: ${curve.tokenTotalSupply
      .div(new BN(10 ** curve.tokenDecimals))
      .toString()}
    Sol Raise Target: ${curve.solRaiseTarget
      .div(new BN(LAMPORTS_PER_SOL))
      .toString()} SOL
    Token Address: ${curve.mint.toBase58()}
    Treasury Address: ${proposal.treasuryAddress.toBase58()}
    URI: ${metadata?.uri || proposal?.logoUri || "N/A"}
  `;
        })
        .join("\n");

      return mcpText(
        `Found ${listResult.data.length} bonding curves:\n\n${formattedText}`
      );
    },
  },
  {
    name: "getBondingCurveDetails",
    description: "Get detailed information about a bonding curve token",
    schema: {
      mintAddress: z.string().describe("Address of token mint"),
    },
    async func(args: { mintAddress: string }) {
      const { mintAddress } = args;

      const result = await getBondingCurveService();
      if (!result.success || !result.service) {
        return mcpError(result.error!, result.suggestion);
      }

      const { service } = result;

      let mint = new PublicKey(mintAddress);

      const [curveResult, proposalResult, metadataResult] = await Promise.all([
        service.getBondingCurve(mint),
        service.getProposal(mint),
        service.getMetadata(mint),
      ]);

      if (!curveResult.success) {
        return mcpError(
          `Failed to get bonding curve data: ${curveResult.error?.message}`,
          "Check your mint address"
        );
      }

      const curve = curveResult.data;
      const proposal = proposalResult.success ? proposalResult.data : null;
      const metadata = metadataResult.success ? metadataResult.data : null;

      return mcpText(`📊 Bonding Curve Details: ${proposal?.name} 
  🔨 Metadata: ${JSON.stringify(metadata, null, 0)}
  🔑 Mint Address: ${mint.toString()}
  🪙 Token Details:
    - Decimals: ${curve?.tokenDecimals}
    - Total Supply: ${curve?.tokenTotalSupply
      .div(new BN(10 ** curve.tokenDecimals))
      .toString()}
    - URI: ${metadata?.uri || proposal?.logoUri || "N/A"}
    - Authority Address: ${proposal?.authorityAddress.toBase58()}
  🏦 Treasury Address: ${proposal?.treasuryAddress.toBase58()}
  📈 Bonding Curve:
    - Complete: ${curve?.complete ? "✅" : "❌"}
    - Total Supply: ${curve?.tokenTotalSupply
      .div(new BN(10 ** curve.tokenDecimals))
      .toString()}
    - Sol Raise Target: ${curve?.solRaiseTarget
      .div(new BN(LAMPORTS_PER_SOL))
      .toString()} SOL
    - Token Decimals: ${curve?.tokenDecimals}
    - Raised Amount: ${curve?.realSolReserves
      .div(new BN(LAMPORTS_PER_SOL))
      .toString()} SOL
    - Tokens left to buy: ${curve?.realTokenReserves
      .div(new BN(10 ** curve.tokenDecimals))
      .toString()}

  🧑‍💼 Contacts:
    - Website: ${proposal?.websiteUrl || "N/A"}
    - Twitter: ${proposal?.twitterHandle || "N/A"}
    - Discord: ${proposal?.discordLink || "N/A"}
    - Founder: ${proposal?.founderName || "N/A"} ${
        proposal?.founderTwitter ? `(@${proposal.founderTwitter})` : ""
      }

  📝 Additional Info:
    - Description: ${proposal?.description || "N/A"}
    - Thesis: ${proposal?.bullishThesis || "N/A"}
  `);
    },
  },
  {
    name: "simulateSwap",
    description: "Simulate a token swap without executing the transaction",
    schema: {
      mintAddress: z.string().describe("Address of token mint"),
      isBuy: z
        .boolean()
        .describe("True to buy tokens with SOL, False to sell tokens for SOL"),
      amount: z
        .number()
        .describe("Amount to swap (in SOL if buying, in tokens if selling)"),
      slippagePercent: z
        .number()
        .optional()
        .default(0.5)
        .describe("Slippage tolerance percentage (default 0.5%)"),
    },
    async func(args: {
      mintAddress: string;
      isBuy: boolean;
      amount: number;
      slippagePercent?: number;
    }) {
      const { mintAddress, isBuy, amount, slippagePercent = 0.5 } = args;

      const result = await getBondingCurveService();
      if (!result.success || !result.service) {
        return mcpError(result.error!, result.suggestion);
      }

      const { service } = result;
      const mint = new PublicKey(mintAddress);

      try {
        // Get token name for display
        const proposalResult = await service.getProposal(mint);
        const tokenName = proposalResult.success
          ? proposalResult.data?.name
          : mintAddress;
        if (isBuy) {
          // Convert SOL amount to lamports
          const amountBN = new BN(amount * LAMPORTS_PER_SOL);

          // Simulate buy
          const simulationResult = await service.simulateBuy(
            mint,
            amountBN,
            slippagePercent
          );

          if (!simulationResult.success) {
            return mcpError(
              `Failed to simulate buy: ${simulationResult.error?.message}`,
              "Check your inputs and try again"
            );
          }

          // Format the results for display
          const sim = simulationResult.data!;
          const tokenDecimalsFactor = Math.pow(10, sim.tokenDecimals);
          const expectedTokenAmount = sim.expectedTokenAmount
            .div(new BN(tokenDecimalsFactor))
            .toNumber();
          const minTokenAmount = sim.minTokenAmount
            .div(new BN(tokenDecimalsFactor))
            .toNumber();
          const feeInSol = sim.fee.div(new BN(LAMPORTS_PER_SOL)).toNumber();
          const netSolCost = amount - feeInSol;

          // Format completion status
          const completionStatus = sim.willComplete
            ? "⚠️ This purchase will complete the bonding curve!"
            : "This purchase will not complete the bonding curve.";

          return mcpText(`🔮 Buy Simulation for ${tokenName}

💰 Input: ${amount} SOL
🪙 Expected output: ${expectedTokenAmount.toFixed(6)} tokens
🪙 Minimum output (with ${slippagePercent}% slippage): ${minTokenAmount.toFixed(
            6
          )} tokens
💸 Fee: ${feeInSol.toFixed(6)} SOL
💸 Net cost: ${netSolCost.toFixed(6)} SOL
📊 Price impact: ${sim.priceImpact.toFixed(2)}%
💱 Price per token: ${sim.pricePerToken.toFixed(6)} SOL
${completionStatus}

To execute this swap, use the \`swap\` tool with:
  --mintAddress "${mintAddress}" --isBuy true --amount ${amount} --slippagePercent ${slippagePercent}`);
        } else {
          // Convert token amount to smallest unit
          const curveResult = await service.getBondingCurve(mint);
          if (!curveResult.success) {
            return mcpError(
              `Failed to get bonding curve: ${curveResult.error?.message}`,
              "Check the mint address and try again"
            );
          }

          const tokenDecimalsFactor = Math.pow(
            10,
            curveResult.data?.tokenDecimals!
          );
          const amountBN = new BN(amount * tokenDecimalsFactor);

          // Simulate sell
          const simulationResult = await service.simulateSell(
            mint,
            amountBN,
            slippagePercent
          );

          if (!simulationResult.success) {
            return mcpError(
              `Failed to simulate sell: ${simulationResult.error?.message}`,
              "Check your inputs and try again"
            );
          }

          // Format the results for display
          const sim = simulationResult.data!;
          const expectedSolAmount = sim.expectedSolAmount
            .div(new BN(LAMPORTS_PER_SOL))
            .toNumber();
          const minSolAmount = sim.minSolAmount
            .div(new BN(LAMPORTS_PER_SOL))
            .toNumber();
          const feeInSol = sim.fee.div(new BN(LAMPORTS_PER_SOL)).toNumber();
          const netSolReceived = expectedSolAmount; // Already net of fee

          return mcpText(`🔮 Sell Simulation for ${tokenName}

🪙 Input: ${amount} tokens
💰 Expected output: ${expectedSolAmount.toFixed(6)} SOL
💰 Minimum output (with ${slippagePercent}% slippage): ${minSolAmount.toFixed(
            6
          )} SOL
💸 Fee: ${feeInSol.toFixed(6)} SOL
💸 Net received: ${netSolReceived.toFixed(6)} SOL
📊 Price impact: ${sim.priceImpact.toFixed(2)}%
💱 Price per token: ${sim.pricePerToken.toFixed(6)} SOL

To execute this swap, use the \`swap\` tool with:
  --mintAddress "${mintAddress}" --isBuy false --amount ${amount} --slippagePercent ${slippagePercent}`);
        }
      } catch (error: any) {
        return mcpError(
          `Simulation failed: ${error.message}`,
          "Check your inputs and try again"
        );
      }
    },
  },
  {
    name: "getMaxBuy",
    description:
      "Calculate the maximum amount of SOL you can use to buy tokens",
    schema: {
      mintAddress: z.string().describe("Address of token mint"),
    },
    async func(args: { mintAddress: string }) {
      const { mintAddress } = args;

      const result = await getBondingCurveService();
      if (!result.success || !result.service) {
        return mcpError(result.error!, result.suggestion);
      }

      const { service } = result;
      const mint = new PublicKey(mintAddress);

      try {
        // Get token name for display
        const proposalResult = await service.getProposal(mint);
        const tokenName = proposalResult.success
          ? proposalResult.data?.name
          : mintAddress;

        // Get max buy info
        const maxBuyResult = await service.calculateMaxBuy(mint);

        if (!maxBuyResult.success) {
          return mcpError(
            `Failed to calculate max buy: ${maxBuyResult.error?.message}`,
            "Check the mint address and try again"
          );
        }

        // Format the results
        const maxBuy = maxBuyResult.data;
        const curveResult = await service.getBondingCurve(mint);

        if (!curveResult.success) {
          return mcpError(
            `Failed to get bonding curve data: ${curveResult.error?.message}`,
            "Check the mint address and try again"
          );
        }

        const curve = curveResult.data!;
        const tokenDecimalsFactor = Math.pow(10, curve.tokenDecimals);

        const maxSolAmount = maxBuy?.maxSolAmount
          .div(new BN(LAMPORTS_PER_SOL))
          .toNumber();
        const tokenAmount = maxBuy?.tokenAmount
          .div(new BN(tokenDecimalsFactor))
          .toNumber();

        // Simulate this max buy to get more info
        const simulationResult = await service.simulateBuy(
          mint,
          maxBuy!.maxSolAmount,
          0.5
        );

        let priceImpact = "-";
        let fee = "-";

        if (simulationResult.success) {
          priceImpact = `${simulationResult.data!.priceImpact.toFixed(2)}%`;
          fee = `${simulationResult.data!.fee.div(
            new BN(LAMPORTS_PER_SOL)
          )} SOL`;
        }

        return mcpText(`🔝 Maximum Buy for ${tokenName}

💰 Maximum SOL input: ${maxSolAmount?.toFixed(6)} SOL
🪙 Expected tokens output: ${tokenAmount?.toFixed(6)} tokens
📊 Estimated price impact: ${priceImpact}
💸 Estimated fee: ${fee}
ℹ️ Completion: ${maxBuy?.completionReason}

Note: This is an estimate and actual values may vary slightly due to market conditions.`);
      } catch (error: any) {
        return mcpError(
          `Max buy calculation failed: ${error.message}`,
          "Check the mint address and try again"
        );
      }
    },
  },
  {
    name: "migrateToRaydium",
    description:
      "Migrate from bonding curve to Raydium pool and claim LP tokens",
    schema: {
      mintAddress: z.string().describe("Address of token mint"),
    },
    async func(args: { mintAddress: string }) {
      const { mintAddress } = args;

      const result = await getBondingCurveService();
      if (!result.success || !result.service) {
        return mcpError(result.error!, result.suggestion);
      }

      const { service } = result;
      const mint = new PublicKey(mintAddress);

      try {
        // Get token name for display
        const proposalResult = await service.getProposal(mint);
        const tokenName = proposalResult.success
          ? proposalResult.data?.name
          : mintAddress;

        // Check if the bonding curve is complete
        const curveResult = await service.getBondingCurve(mint);
        if (!curveResult.success || !curveResult.data) {
          return mcpError(
            `Failed to get bonding curve data: ${curveResult.error?.message}`,
            "Check your mint address"
          );
        }

        if (!curveResult.data.complete) {
          return mcpError(
            "Bonding curve is not complete yet",
            "Bonding curve must be complete (SOL raise target met) before migrating to Raydium"
          );
        }

        // Migrate and claim LP tokens in one transaction
        const migrationResult = await service.migrateToRaydiumAndClaimLpTokens(
          mint
        );

        if (!migrationResult.success) {
          return mcpError(
            `Migration failed: ${migrationResult.error?.message}`,
            "Please try again later or check if migration has already been completed"
          );
        }

        return mcpText(
          `✅ Successfully migrated ${tokenName} to Raydium and claimed LP tokens!\n\nTransaction: ${migrationResult.data}`
        );
      } catch (error: any) {
        return mcpError(
          `Migration failed: ${error.message}`,
          "Please try again or check if migration has already been completed"
        );
      }
    },
  },
];
