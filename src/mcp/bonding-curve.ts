import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useMcpContext, mcpError, mcpText } from "../utils/mcp-hooks";
import { BondingCurveService } from "../services/bonding-curve-service";
import * as anchor from "@coral-xyz/anchor";
import IDL from "../../idls/bonding_curve.json";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { CreateBondingCurveParams } from "../types";
import { MultisigService } from "../services/multisig-service";
import { Keypair } from "@solana/web3.js";
import {
  formatTokenAmount,
  formatTokenSymbol,
  getTokenInfo,
} from "../utils/token-utils";
import { ConfigService } from "../services/config-service";

async function getBondingCurveService() {
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
  try {
    // Create bonding curve service
    const connection = context.connection;
    const wallet = new anchor.Wallet(context.keypair);
    let name = undefined;
    try {
      name = context.config.network.name;
      if (!name) {
        throw new Error("Network name is not defined");
      }
    } catch (e) {
      return {
        success: false,
        error:
          "Failed to get network name, bc access bhi nhi kr skte is name ko",
        suggestion: "Check your network configuration",
      };
    }
    const networkName = name || "devnet";
    const service = new BondingCurveService(
      context.connection,
      wallet,
      "confirmed",
      IDL as anchor.Idl,
      networkName
    );
    return { success: true, service, wallet, connection };
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
          ? new BN(Math.round(migrateFeeAmount * LAMPORTS_PER_SOL))
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
  // Update the createBondingCurve tool
  {
    name: "createBondingCurve",
    description:
      "Launch a new bonding curve project token on the bonding curve protocol. Available for both individuals and teams. For teams, a multisig will be created to manage the project, the multisig creation will be handled in this tool itself using the isATeam parameter. The bonding curve will raise the baseRaiseTarget amount of base tokens, and the project token will be created with the specified name, symbol, and description. The project token will be managed by the multisig or the individual wallet after migration. At migration, the project token will be migrated to a Raydium pool. The raised funds will be distributed 80/20 to the multisig/individual wallet and the Raydium pool respectively. The bonding curve treasury will be used to fund the project. The project token supply is also distributed 50/30/20 to bonding curve swaps and trade, the Raydium pool, and the multisig/individual wallet respectively.",
    schema: {
      name: z
        .string()
        .describe("Name of the project, for which the token is created"),
      symbol: z.string().describe("Symbol of the project token"),
      description: z
        .string()
        .describe("Description of the project, up to 150 characters"),
      members: z
        .array(z.string())
        .optional()
        .describe(
          "The addresses of the team members, if the project founder is a team of individuals"
        ),
      isATeam: z
        .boolean()
        .optional()
        .default(false)
        .describe("Is the project founder a team of individuals?"),
      threshold: z
        .number()
        .optional()
        .default(1)
        .describe(
          "Only applicable if the project founder is a team of individuals. The number of members required to approve a transaction."
        ),
      baseRaiseTarget: z
        .number()
        .describe(
          "Base raise target (in base token units, e.g. SOL, not lamports)"
        ),
      baseMint: z.string().describe("Base token mint address (e.g. WSOL)"),
      tokenDecimals: z
        .number()
        .default(6)
        .describe("Token decimals for the new project token"),
      tokenTotalSupply: z
        .number()
        .describe("Total token supply for the new project token"),
      image: z.string().describe("Base64 encoded image data"),
      twitterHandle: z
        .string()
        .optional()
        .describe(
          "Twitter handle of the project (optional). Required if the project founder is a team of individuals, formatted as @username"
        ),
      discordLink: z
        .string()
        .optional()
        .describe(
          "Discord link of the project (optional). Required if the project founder is a team of individuals"
        ),
      websiteUrl: z
        .string()
        .optional()
        .describe(
          "Website URL of the project (optional). Required if the project founder is a team of individuals"
        ),
      founderName: z
        .string()
        .optional()
        .describe(
          "Founder name of the project (optional). Required if the project founder is a team of individuals, can be a team name as well"
        ),
      founderTwitter: z
        .string()
        .optional()
        .describe(
          "Founder Twitter handle (optional). Required if the project founder is a team of individuals, formatted as @username"
        ),
      bullishThesis: z
        .string()
        .optional()
        .describe(
          "Why someone should invest in this project? (optional). Required if the project founder is a team of individuals, be descriptive and provide a clear thesis"
        ),
    },
    async func(args: any) {
      let {
        name,
        symbol,
        description,
        members,
        isATeam,
        threshold,
        baseRaiseTarget,
        baseMint,
        image,
        tokenDecimals = 6,
        tokenTotalSupply,
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

      const { service, wallet, connection } = result;

      // Get base token mint info to fetch decimals automatically
      const baseMintPubkey = new PublicKey(baseMint);
      const baseMintInfoResult = await getTokenInfo(connection, baseMintPubkey);

      if (!baseMintInfoResult.success || !baseMintInfoResult.data) {
        return mcpError(
          `Failed to get base token information: ${baseMintInfoResult.error?.message}`,
          "Check that the base token mint address is correct"
        );
      }

      const baseDecimals = baseMintInfoResult.data.decimals;
      const baseTokenSymbol = formatTokenSymbol(
        baseMintInfoResult.data.metadata,
        baseMintPubkey.toBase58()
      );

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

      let authorityAddressFromMultisig = undefined;

      if ((isATeam && !members) || !members?.length || threshold < 1) {
        return mcpError(
          "Members are required if the project founder is a team of individuals",
          "Provide the addresses of the team members, and ensure the threshold is at least 1"
        );
      }
      if (isATeam && members.length < 2) {
        return mcpError(
          "At least two members are required if the project founder is a team of individuals",
          "Provide the addresses of the team members"
        );
      }

      let responseForLLM = ``;
      if (isATeam) {
        try {
          const context = await useMcpContext({});
          if (!context.success || !context.connection) {
            return mcpError(
              context.error!,
              "Failed to get context for multisig creation"
            );
          }
          founderName = founderName ?? members[0];
          responseForLLM = `The project founder is a team of individuals. The members are: ${members.join(
            ", "
          )}. The threshold is ${threshold}.`;
          const memberList = members.map(
            (member: string) => new PublicKey(member)
          );
          const multisigResponse = await MultisigService.createMultisig(
            context.connection,
            wallet.payer,
            threshold,
            memberList,
            `${name} Multisig`,
            Keypair.generate()
          );
          if (!multisigResponse.success || !multisigResponse.data) {
            return mcpError(
              `Failed to create multisig: ${multisigResponse.error?.message}`,
              "Check your input parameters and try again"
            );
          }

          const multisigAddress = multisigResponse.data.multisigPda;
          await ConfigService.setActiveSquadsMultisig(
            multisigAddress.toBase58()
          );
          authorityAddressFromMultisig =
            MultisigService.getMultisigVaultPda(multisigAddress).data;

          responseForLLM += `\n✅ Squads Multisig created successfully! Multisig address: ${multisigAddress.toBase58()}`;
        } catch (err) {
          return mcpError(
            `Failed to create multisig: ${err}`,
            "Check your input parameters and try again"
          );
        }
      }

      // create the bonding curve params
      const createParams: CreateBondingCurveParams = {
        baseMint: new PublicKey(baseMint),
        name,
        symbol,
        buff: imageBuffer,
        baseRaiseTarget: new BN(
          Math.round(baseRaiseTarget * Math.pow(10, baseDecimals))
        ),
        description,
        treasuryAddress: authorityAddressFromMultisig ?? wallet.publicKey,
        authorityAddress: authorityAddressFromMultisig ?? wallet.publicKey,
        tokenDecimals,
        baseDecimals,
        tokenTotalSupply: new BN(
          Math.round(tokenTotalSupply * Math.pow(10, tokenDecimals))
        ),
        twitterHandle: twitterHandle ?? null,
        discordLink: discordLink ?? null,
        websiteUrl: websiteUrl ?? null,
        logoUri: null,
        founderName: founderName ?? null,
        founderTwitter: founderTwitter ?? null,
        bullishThesis: bullishThesis ?? null,
      };

      const createResult = await service.createBondingCurve(createParams);

      if (!createResult.success || !createResult.data) {
        return mcpError(
          `Failed to create bonding curve: ${createResult.error?.message}`,
          "Check your input parameters and try again"
        );
      }

      return mcpText(
        responseForLLM +
          `🚀 Successfully created token on bonding curve!\n\n` +
          `📝 Project: ${name} (${symbol})\n` +
          `🔑 Token Address: ${createResult.data.tokenMintAddress}\n` +
          `🪙 Token Supply: ${formatTokenAmount(
            tokenTotalSupply,
            tokenDecimals
          )}\n` +
          `💰 Base Token: ${baseTokenSymbol} (${baseDecimals} decimals)\n` +
          `🎯 Raise Target: ${baseRaiseTarget} ${baseTokenSymbol}\n` +
          (isATeam
            ? `👥 Managed by team multisig with ${threshold} of ${members.length} required signatures\n`
            : `👤 Managed by individual wallet: ${wallet.publicKey.toBase58()}\n`) +
          `🔗 Transaction: ${createResult.data.tx}\n\n` +
          `What's next?\n` +
          `1. Fund your token position with the 'swap' command\n` +
          `2. Share details with investors using 'getBondingCurveDetails'\n` +
          `3. Once the raise target is met, migrate to Raydium with 'migrateToRaydium'`
      );
    },
  },
  {
    name: "swap",
    description: "Swap between base and tokens using the bonding curve",
    schema: {
      mintAddress: z.string().describe("Address of token mint"),
      isBuy: z
        .boolean()
        .describe(
          "True to buy tokens with base, False to sell tokens for base"
        ),
      amount: z
        .number()
        .describe("Amount to swap (in base if buying, in tokens if selling)"),
      minOutAmount: z
        .number()
        .describe(
          "Minimum output amount (provided in tokens if buying, in base if selling) (provided from simulateSwap)"
        ),
    },
    async func(args: any) {
      const { mintAddress, isBuy, amount, minOutAmount } = args;
      const result = await getBondingCurveService();
      if (!result.success || !result.service) {
        return mcpError(result.error!, result.suggestion);
      }

      const { service, connection } = result;
      let mint = new PublicKey(mintAddress);
      const curveResult = await service.getBondingCurve(mint);
      if (!curveResult.success || !curveResult.data) {
        return mcpError(
          `Failed to get bonding curve data: ${curveResult.error?.message}`,
          "Check your mint address"
        );
      }

      // Get token metadata for display
      const tokenInfoResult = await getTokenInfo(connection, mint);
      if (!tokenInfoResult.success || !tokenInfoResult.data) {
        return mcpError(
          `Failed to get token info: ${tokenInfoResult.error?.message}`,
          "Check your mint address"
        );
      }
      const tokenName = tokenInfoResult.success
        ? tokenInfoResult.data.metadata?.name ||
          mintAddress.substring(0, 8) + "..."
        : mintAddress.substring(0, 8) + "...";

      const tokenSymbol = tokenInfoResult.success
        ? formatTokenSymbol(tokenInfoResult.data.metadata, mint.toBase58())
        : mint.toBase58().substring(0, 4);

      const baseMintInfoResult = await getTokenInfo(
        connection,
        curveResult.data.baseMint
      );
      if (!baseMintInfoResult.success || !baseMintInfoResult.data) {
        return mcpError(
          `Failed to get base token info: ${baseMintInfoResult.error?.message}`,
          "Check the base mint address"
        );
      }
      const baseTokenSymbol = baseMintInfoResult.success
        ? formatTokenSymbol(
            baseMintInfoResult.data.metadata,
            curveResult.data.baseMint.toBase58()
          )
        : curveResult.data.baseMint.toBase58().substring(0, 4);

      const swapParams = {
        baseIn: !isBuy,
        amount: new BN(
          Math.round(
            amount *
              Math.pow(
                10,
                isBuy
                  ? curveResult.data.baseDecimals
                  : curveResult.data.tokenDecimals
              )
          )
        ),
        minOutAmount: new BN(
          Math.round(
            minOutAmount *
              Math.pow(
                10,
                isBuy
                  ? curveResult.data.tokenDecimals
                  : curveResult.data.baseDecimals
              )
          )
        ),
      };

      const swapResult = await service.swap(mint, swapParams);

      if (!swapResult.success) {
        return mcpError(
          `Swap failed: ${swapResult.error?.message}`,
          "Check your balance and try again"
        );
      }

      const completedCurveCheck = await service.getBondingCurve(mint);
      if (!completedCurveCheck.success || !completedCurveCheck.data) {
        return mcpError(
          `Failed to get bonding curve data: ${completedCurveCheck.error?.message}`,
          "Check your mint address"
        );
      }
      const isCurveComplete =
        completedCurveCheck.success && completedCurveCheck.data.complete;

      const formattedAmount = isBuy
        ? `${amount} ${baseTokenSymbol} → ~ ${formatTokenAmount(
            minOutAmount,
            curveResult.data.tokenDecimals
          )} ${tokenSymbol}`
        : `${amount} ${tokenSymbol} → ~ ${formatTokenAmount(
            minOutAmount,
            curveResult.data.baseDecimals
          )} ${baseTokenSymbol}`;

      // Auto-migrate if curve is complete
      let migrationResult = null;
      if (isCurveComplete) {
        migrationResult = await service.migrateToRaydiumAndClaimLpTokens(mint);
      }

      return mcpText(
        `✅ Swap completed successfully!\n\n` +
          `🪙 ${isBuy ? "Bought" : "Sold"} tokens: ${formattedAmount}\n` +
          `🔗 Transaction: ${swapResult.data}\n\n` +
          (isCurveComplete
            ? migrationResult && migrationResult.success
              ? `🎉 Bonding curve completed! Automatically migrated to Raydium.\n` +
                `   LP tokens have been claimed to your wallet.\n` +
                `   Migration transaction: ${migrationResult.data}\n\n`
              : `🎉 Bonding curve is now complete!\n` +
                `   Migration to Raydium ${
                  migrationResult
                    ? "failed: " + migrationResult.error?.message
                    : "was not attempted"
                }.\n` +
                `   Please use 'migrateToRaydium' manually.\n\n`
            : `📊 The bonding curve is still active.\n` +
              `   You can check the current status with 'getBondingCurveDetails'.\n\n`) +
          `What's next?\n` +
          `• View your token balance with 'showWallet'\n` +
          `• Check curve details with 'getBondingCurveDetails'\n` +
          (isCurveComplete
            ? `• Your token is now tradeable on Raydium`
            : isBuy
            ? `• You can sell tokens later with 'swap' (isBuy: false)`
            : `• You can buy more tokens with 'swap' (isBuy: true)`)
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

      const { service, connection } = result;
      let mint = new PublicKey(mintAddress);

      // Use the new token utilities
      const tokenInfoResult = await getTokenInfo(connection, mint);
      if (!tokenInfoResult.success || !tokenInfoResult.data) {
        return mcpError(
          `Failed to get token info: ${tokenInfoResult.error?.message}`,
          "Check your mint address"
        );
      }
      const tokenMetadata = tokenInfoResult.success
        ? tokenInfoResult.data.metadata
        : undefined;

      const [curveResult, proposalResult] = await Promise.all([
        service.getBondingCurve(mint),
        service.getProposal(mint),
      ]);

      if (!curveResult.success || !curveResult.data) {
        return mcpError(
          `Failed to get bonding curve data: ${curveResult.error?.message}`,
          "Check your mint address"
        );
      }

      const curve = curveResult.data;
      const proposal = proposalResult.success ? proposalResult.data : null;

      // Get base token info
      const baseMintInfoResult = await getTokenInfo(connection, curve.baseMint);
      if (!baseMintInfoResult.success || !baseMintInfoResult.data) {
        return mcpError(
          `Failed to get base token info: ${baseMintInfoResult.error?.message}`,
          "Check the base mint address"
        );
      }
      const baseTokenSymbol = baseMintInfoResult.success
        ? formatTokenSymbol(
            baseMintInfoResult.data.metadata,
            curve.baseMint.toBase58()
          )
        : curve.baseMint.toBase58().substring(0, 4);

      // Calculate remaining tokens to buy
      const remainingTokens = curve.realTokenReserves;
      const formattedRemainingTokens = formatTokenAmount(
        remainingTokens.toString(),
        curve.tokenDecimals
      );

      // Calculate raised amount
      const raisedAmount = curve.realBaseReserves;
      const formattedRaisedAmount = formatTokenAmount(
        raisedAmount.toString(),
        curve.baseDecimals
      );

      // Calculate total supply
      const formattedTotalSupply = formatTokenAmount(
        curve.tokenTotalSupply.toString(),
        curve.tokenDecimals
      );

      // Calculate base raise target
      const formattedBaseRaiseTarget = formatTokenAmount(
        curve.baseRaiseTarget.toString(),
        curve.baseDecimals
      );

      // Enhanced formatting
      return mcpText(
        `📊 Bonding Curve Details: ${
          proposal?.name || tokenMetadata?.name || mint.toString()
        }\n\n` +
          `🪙 Token Information:\n` +
          `  • Name: ${tokenMetadata?.name || "N/A"}\n` +
          `  • Symbol: ${tokenMetadata?.symbol || "N/A"}\n` +
          `  • Mint Address: ${mint.toString()}\n` +
          `  • Decimals: ${curve?.tokenDecimals}\n` +
          `  • Total Supply: ${formattedTotalSupply}\n\n` +
          `📈 Bonding Curve Status:\n` +
          `  • Complete: ${curve?.complete ? "✅" : "❌"}\n` +
          `  • Base Raise Target: ${formattedBaseRaiseTarget} ${baseTokenSymbol}\n` +
          `  • Raised Amount: ${formattedRaisedAmount} ${baseTokenSymbol} ` +
          `(${(
            (Number(formattedRaisedAmount) / Number(formattedBaseRaiseTarget)) *
            100
          ).toFixed(2)}%)\n` +
          `  • Tokens left to buy: ${formattedRemainingTokens}\n\n` +
          `🏦 Project Information:\n` +
          `  • Description: ${proposal?.description || "N/A"}\n` +
          `  • Website: ${proposal?.websiteUrl || "N/A"}\n` +
          `  • Twitter: ${proposal?.twitterHandle || "N/A"}\n` +
          `  • Discord: ${proposal?.discordLink || "N/A"}\n` +
          `  • Founder: ${proposal?.founderName || "N/A"} ${
            proposal?.founderTwitter ? `(@${proposal.founderTwitter})` : ""
          }\n\n` +
          `💼 Management:\n` +
          `  • Treasury Address: ${proposal?.treasuryAddress.toBase58()}\n` +
          `  • Authority Address: ${proposal?.authorityAddress.toBase58()}\n\n` +
          `💡 Investment Thesis:\n` +
          `  ${proposal?.bullishThesis || "No thesis provided"}\n\n` +
          `⚙️ What you can do:\n` +
          `  • To buy tokens: Use 'simulateSwap' to preview and 'swap' to execute\n` +
          `  • To check max investment: Use 'getMaxBuy'\n` +
          `  • When complete: Use 'migrateToRaydium' to create a Raydium pool`
      );
    },
  },
  {
    name: "simulateSwap",
    description: "Simulate a token swap without executing the transaction",
    schema: {
      mintAddress: z.string().describe("Address of token mint"),
      isBuy: z
        .boolean()
        .describe(
          "True to buy tokens with base token, False to sell tokens for base token"
        ),
      amount: z
        .number()
        .describe(
          "Amount to swap (in base token if buying, in tokens if selling)"
        ),
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

      const { service, connection } = result;
      const mint = new PublicKey(mintAddress);

      try {
        const curveResult = await service.getBondingCurve(mint);
        if (!curveResult.success || !curveResult.data) {
          return mcpError(
            `Failed to get bonding curve data: ${curveResult.error?.message}`,
            "Check the mint address and try again"
          );
        }

        // Get token and base token info for better display
        const tokenInfoResult = await getTokenInfo(connection, mint);
        if (!tokenInfoResult.success || !tokenInfoResult.data) {
          return mcpError(
            `Failed to get token info: ${tokenInfoResult.error?.message}`,
            "Check the mint address and try again"
          );
        }
        const tokenName = tokenInfoResult.success
          ? tokenInfoResult.data.metadata?.name ||
            mint.toBase58().substring(0, 8) + "..."
          : mintAddress.substring(0, 8) + "...";

        const tokenSymbol = tokenInfoResult.success
          ? formatTokenSymbol(tokenInfoResult.data.metadata, mint.toBase58())
          : mint.toBase58().substring(0, 4);

        const baseMintInfoResult = await getTokenInfo(
          connection,
          curveResult.data.baseMint
        );
        if (!baseMintInfoResult.success || !baseMintInfoResult.data) {
          return mcpError(
            `Failed to get base token info: ${baseMintInfoResult.error?.message}`,
            "Check the base mint address"
          );
        }
        const baseTokenSymbol = baseMintInfoResult.success
          ? formatTokenSymbol(
              baseMintInfoResult.data.metadata,
              curveResult.data.baseMint.toBase58()
            )
          : curveResult.data.baseMint.toBase58().substring(0, 4);

        if (isBuy) {
          // Convert base amount to smallest unit (lamports, etc)
          const baseDecimals = curveResult.data.baseDecimals;
          const amountBN = new BN(
            Math.round(amount * Math.pow(10, baseDecimals))
          );

          // Simulate buy
          const simulationResult = await service.simulateBuy(
            mint,
            amountBN,
            slippagePercent
          );

          if (!simulationResult.success) {
            return mcpError(
              `Simulation failed: ${simulationResult.error?.message}`,
              "Check your input and try again"
            );
          }

          // Format the results for display
          const sim = simulationResult.data!;
          const expectedTokenAmount = formatTokenAmount(
            sim.tokenAmount.toString(),
            sim.tokenDecimals
          );
          const minTokenAmount = formatTokenAmount(
            sim.minTokenAmount.toString(),
            sim.tokenDecimals
          );
          const feeInBase = formatTokenAmount(
            sim.feeAmount.toString(),
            sim.baseDecimals
          );
          const netBaseCostRequired = (amount - Number(feeInBase)).toFixed(6);

          // Format completion status
          const completionStatus = sim.willComplete
            ? "⚠️ This purchase will complete the bonding curve!"
            : "This purchase will not complete the bonding curve.";

          // For swap, pass human-readable values (not scaled)
          const minOutHuman =
            Number(sim.minTokenAmount.toString()) /
            Math.pow(10, sim.tokenDecimals);

          return mcpText(
            `🔮 Buy Simulation for ${tokenName} (${tokenSymbol})\n\n` +
              `💰 Input: ${amount} ${baseTokenSymbol}\n` +
              `🪙 Expected output: ${expectedTokenAmount} ${tokenSymbol}\n` +
              `🪙 Minimum output (with ${slippagePercent}% slippage): ${minTokenAmount} ${tokenSymbol}\n` +
              `💸 Fee: ${feeInBase} ${baseTokenSymbol}\n` +
              `💸 Net cost: ${netBaseCostRequired} ${baseTokenSymbol}\n` +
              `📊 Price impact: ${sim.priceImpact.toFixed(2)}%\n` +
              `💱 Price per token: ${sim.pricePerToken.toFixed(
                6
              )} ${baseTokenSymbol}\n` +
              `${completionStatus}\n\n` +
              `To execute this swap, use the \`swap\` tool with:\n` +
              `  --mintAddress "${mintAddress}" --isBuy true --amount ${amount} --minOutAmount ${minOutHuman}`
          );
        } else {
          // Sell: convert token amount to smallest unit
          const tokenDecimals = curveResult.data.tokenDecimals;
          const amountBN = new BN(
            Math.round(amount * Math.pow(10, tokenDecimals))
          );

          // Simulate sell
          const simulationResult = await service.simulateSell(
            mint,
            amountBN,
            slippagePercent
          );

          if (!simulationResult.success) {
            return mcpError(
              `Simulation failed: ${simulationResult.error?.message}`,
              "Check your input and try again"
            );
          }

          const sim = simulationResult.data!;
          const expectedBaseAmount = formatTokenAmount(
            sim.baseAmount.toString(),
            sim.baseDecimals
          );
          const minBaseAmount = formatTokenAmount(
            sim.minBaseAmount.toString(),
            sim.baseDecimals
          );
          const feeInBase = formatTokenAmount(
            sim.feeAmount.toString(),
            sim.baseDecimals
          );
          const netTokenAmount = (amount - Number(feeInBase)).toFixed(6);

          const completionStatus = ""; // Not used for sell

          // For swap, pass human-readable values (not scaled)
          const minOutHuman =
            Number(sim.minBaseAmount.toString()) /
            Math.pow(10, sim.baseDecimals);

          return mcpText(
            `🔮 Sell Simulation for ${tokenName} (${tokenSymbol})\n\n` +
              `💰 Input: ${amount} ${tokenSymbol}\n` +
              `🪙 Expected output: ${expectedBaseAmount} ${baseTokenSymbol}\n` +
              `🪙 Minimum output (with ${slippagePercent}% slippage): ${minBaseAmount} ${baseTokenSymbol}\n` +
              `💸 Fee: ${feeInBase} ${baseTokenSymbol}\n` +
              `💸 Net output: ${netTokenAmount} ${baseTokenSymbol}\n` +
              `📊 Price impact: ${sim.priceImpact.toFixed(2)}%\n` +
              `💱 Price per token: ${sim.pricePerToken.toFixed(
                6
              )} ${baseTokenSymbol}\n` +
              `${completionStatus}\n\n` +
              `To execute this swap, use the \`swap\` tool with:\n` +
              `  --mintAddress "${mintAddress}" --isBuy false --amount ${amount} --minOutAmount ${minOutHuman}`
          );
        }
      } catch (error: any) {
        return mcpError(
          `Simulation failed: ${error.message}`,
          "Check your input and try again"
        );
      }
    },
  },
  {
    name: "getMaxBuy",
    description:
      "Calculates the maximum amount of base tokens you can use to buy tokens, such that the bonding curve is complete. This is useful for estimating the maximum amount of base tokens you can invest in a project token.",
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

        const maxBaseAmount = maxBuy?.maxBaseAmount
          .div(new BN(10 ** curve.baseDecimals))
          .toNumber();
        const tokenAmount = maxBuy?.tokenAmount
          .div(new BN(tokenDecimalsFactor))
          .toNumber();

        // Simulate this max buy to get more info
        const simulationResult = await service.simulateBuy(
          mint,
          maxBuy!.maxBaseAmount,
          0.5
        );

        let priceImpact = "-";
        let fee = "-";

        if (simulationResult.success) {
          priceImpact = `${simulationResult.data!.priceImpact.toFixed(2)}%`;
          fee = `${simulationResult.data!.feeAmount.div(
            new BN(10 ** curve.baseDecimals)
          )} base tokens`;
        }

        return mcpText(`🔝 Maximum Buy for ${tokenName}

💰 Maximum base token input: ${maxBaseAmount?.toFixed(6)} 
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
      "This tool migrates the bonding curve to Raydium, claims the LP tokens to creator's wallet. Asset transfers are done to the authority address from the bonding curve. The state remains on-chain, and the token is migrated to a Raydium pool.",
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
            "Bonding curve must be complete (base raise target met) before migrating to Raydium"
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
          `✅ Successfully migrated ${tokenName} to Raydium and claimed LP tokens!\n\nTransaction: ${migrationResult.data}. The LP tokens have been sent to your wallet, and the bonding curve has been closed. The state remains on-chain, and the token is now a Raydium pool. The assets have also been transferred to the authority address from the bonding curve`
        );
      } catch (error: any) {
        return mcpError(
          `Migration failed: ${error.message}`,
          "Please try again or check if migration has already been completed"
        );
      }
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
    Base Raise Target: ${curve.baseRaiseTarget
      .div(new BN(10).pow(new BN(curve.baseDecimals)))
      .toString()} 
    Token Address: ${curve.tokenMint.toBase58()}
    Base Mint Address: ${curve.baseMint.toBase58()}
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
];
