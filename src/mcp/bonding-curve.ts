import { PublicKey } from "@solana/web3.js";
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
    const wallet = new anchor.Wallet(context.keypair);
    const service = new BondingCurveService(
      context.connection,
      wallet,
      "confirmed",
      IDL as anchor.Idl,
      context.config.network.name
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
      "Launch a new project token on a linear bonding curve, a base token is used to raise funds. The tool expects the user to be either an individual or a team of individuals launching a project token on Solana. The team should be able to create a Squads multisig and provide vault address as the vault and authority address. The tool will create a new token mint and initialize the bonding curve with the provided parameters. If its a team, it is expected that they must provide members and even the optional fields like founder name, twitter handle, etc. The tool will also provide a base64 encoded image data for the token logo. ",
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
      baseDecimals: z
      .number()
      .describe("Base token decimals for the existing base token"),
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
        baseDecimals,
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

      let authorityAddressFromMultisig = undefined;

      if ((isATeam && !members) || !members.length || threshold < 1) {
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
          authorityAddressFromMultisig =
            MultisigService.getMultisigVaultPda(multisigAddress).data;

          // Should probably save the multisig address to config
          // let's see if we need it later

          responseForLLM += `\n Squads Multisig Creation response:  ${JSON.stringify(
            multisigResponse.data,
            null,
            0
          )}`;
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
        baseRaiseTarget: new BN(baseRaiseTarget),
        description,
        treasuryAddress: authorityAddressFromMultisig ?? wallet.publicKey,
        authorityAddress: authorityAddressFromMultisig ?? wallet.publicKey,
        tokenDecimals,
        baseDecimals,
        tokenTotalSupply: new BN(tokenTotalSupply),
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
          `\n ✅ Successfully created token with bonding curve!\n\nToken: ${name} (${symbol})\nMint Address: ${createResult.data.tokenMintAddress}\nTransaction: ${createResult.data.tx}`
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

      const { service } = result;
      let mint = new PublicKey(mintAddress);
      const curveResult = await service.getBondingCurve(mint);
      if (!curveResult.success || !curveResult.data) {
        return mcpError(
          `Failed to get bonding curve data: ${curveResult.error?.message}`,
          "Check your mint address"
        );
      }

      const swapParams = {
        baseIn: !isBuy,
        amount: new BN(amount),
        minOutAmount: new BN(minOutAmount),
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
    - Base Raise Target: ${curve?.baseRaiseTarget
      .div(new BN(10 ** curve.baseDecimals))
      .toString()} base tokens
    - Token Decimals: ${curve?.tokenDecimals}
    - Raised Amount: ${curve?.baseRaiseTarget
      .div(new BN(10 ** curve.baseDecimals))
      .toString()} base tokens
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

      const { service } = result;
      const mint = new PublicKey(mintAddress);

      try {
        const curveResult = await service.getBondingCurve(mint);
        if (!curveResult.success) {
          return mcpError(
            `Failed to get bonding curve data: ${curveResult.error?.message}`,
            "Check the mint address and try again"
          );
        }
        // Get token name for display
        const proposalResult = await service.getProposal(mint);
        const tokenName = proposalResult.success
          ? proposalResult.data?.name
          : mintAddress;
        if (isBuy) {
          // Convert base amount to smallest unit
          const amountBN = new BN(amount * curveResult.data?.baseDecimals!);

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
          const baseDecimalsFactor = Math.pow(10, sim.baseDecimals);
          const expectedTokenAmount = sim.tokenAmount
            .div(new BN(tokenDecimalsFactor))
            .toNumber();
          const minTokenAmount = sim.minTokenAmount
            .div(new BN(tokenDecimalsFactor))
            .toNumber();
          const feeInBase = sim.feeAmount
            .div(new BN(baseDecimalsFactor))
            .toNumber();
          const netBaseCostRequired = amount - feeInBase;

          // Format completion status
          const completionStatus = sim.willComplete
            ? "⚠️ This purchase will complete the bonding curve!"
            : "This purchase will not complete the bonding curve.";

          return mcpText(`🔮 Buy Simulation for ${tokenName}

💰 Input: ${amount} 
🪙 Expected output: ${expectedTokenAmount.toFixed(6)} tokens
🪙 Minimum output (with ${slippagePercent}% slippage): ${minTokenAmount.toFixed(
            6
          )} tokens
💸 Fee: ${feeInBase.toFixed(6)} 
💸 Net cost: ${netBaseCostRequired.toFixed(6)} 
📊 Price impact: ${sim.priceImpact.toFixed(2)}%
💱 Price per token: ${sim.pricePerToken.toFixed(6)} 
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
          const expectedBaseAmount = sim.baseAmount
            .div(new BN(10 ** sim.baseDecimals))
            .toNumber();
          const minBaseAmount = sim.minBaseAmount
            .div(new BN(10 ** sim.baseDecimals))
            .toNumber();
          const feeInBase = sim.feeAmount
            .div(new BN(10 ** sim.baseDecimals))
            .toNumber();
          const netBaseRecieved = expectedBaseAmount; // Already net of fee

          return mcpText(`🔮 Sell Simulation for ${tokenName}

🪙 Input: ${amount} tokens
💰 Expected output: ${expectedBaseAmount.toFixed(6)} 
💰 Minimum output (with ${slippagePercent}% slippage): ${minBaseAmount.toFixed(
            6
          )} 
💸 Fee: ${feeInBase.toFixed(6)} 
💸 Net received: ${netBaseRecieved.toFixed(6)} 
📊 Price impact: ${sim.priceImpact.toFixed(2)}%
💱 Price per token: ${sim.pricePerToken.toFixed(6)} 

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
];
