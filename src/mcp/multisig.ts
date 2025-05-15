import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConfigService } from "../services/config-service";
import { PublicKey, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { MultisigService } from "../services/multisig-service";
import { useMcpContext } from "../utils/mcp-hooks";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  formatTokenAmount,
  formatTokenSymbol,
  getTokenInfo,
} from "../utils/token-utils";

// Standalone Squads Multisig Tool
export function registerMultisigTools(server: McpServer) {
  // Add createMultisig tool
  server.tool(
    "createMultisig",
    "For creating a new standalone multisig. This is a Squads multisig that can be used for managing funds and transactions.",
    {
      name: z.string(),
      members: z.array(z.string()),
      threshold: z.number(),
    },
    async ({ name, members, threshold }) => {
      try {
        const context = await useMcpContext({ requireWallet: true });
        if (!context.success || !context.keypair || !context.connection) {
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
        const membersPubkeys: PublicKey[] = [keypair.publicKey];
        const invalidMembers: string[] = [];

        for (const member of members) {
          try {
            if (member !== keypair.publicKey.toBase58()) {
              membersPubkeys.push(new PublicKey(member));
            }
          } catch (e) {
            invalidMembers.push(member);
          }
        }

        if (invalidMembers.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid member addresses: ${invalidMembers.join(
                  ", "
                )}\n\nSuggestion: Member addresses should be valid Solana public keys. Example format: ${keypair.publicKey.toBase58()}`,
              },
            ],
          };
        }

        if (threshold < 1 || threshold > membersPubkeys.length) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid threshold (${threshold}). Must be between 1 and ${membersPubkeys.length}\n\nSuggestion: Set threshold to a value that represents the minimum number of required approvals`,
              },
            ],
          };
        }

        const createKey = Keypair.generate();
        const createResult = await MultisigService.createMultisig(
          connection,
          keypair,
          threshold,
          membersPubkeys,
          name,
          createKey
        );

        if (!createResult.success || !createResult.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create multisig: ${createResult.error?.message}\n\nSuggestion: Ensure you have enough SOL to pay for transaction fees and try again`,
              },
            ],
          };
        }

        await ConfigService.setActiveSquadsMultisig(
          createResult.data.multisigPda.toBase58()
        );

        return {
          content: [
            {
              type: "text",
              text:
                JSON.stringify(
                  {
                    success: true,
                    multisigAddress: createResult.data.multisigPda.toBase58(),
                    name,
                    threshold,
                    members: membersPubkeys.map((m) => m.toBase58()),
                    transaction: createResult.data.transactionSignature,
                  },
                  null,
                  2
                ) +
                "\n\nNext steps:\n" +
                "1. Use 'fundSolanaToMultisig' to add SOL to your multisig\n" +
                "2. Use 'fundMultisigTokenAccount' to add tokens to your multisig\n" +
                "3. Use 'multisigInfo' to view details about your new multisig",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create multisig: ${error}\n\nSuggestion: Check your network connection and wallet balance`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "getMultisigAddress",
    "Gets the currently configured standalone multisig address",
    {},
    async () => {
      try {
        // Get currently configured multisig
        const multisigRes = await ConfigService.getActiveSquadsMultisig();
        if (!multisigRes.success || !multisigRes.data) {
          return {
            content: [
              {
                type: "text",
                text: "No standalone multisig configured. Use setMultisigAddress to configure one.",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Current standalone multisig: ${multisigRes.data}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting multisig address: ${error}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "fundSolanaToMultisig",
    "Fund the multisig with SOL",
    {
      amount: z.number(),
    },
    async ({ amount }) => {
      try {
        // Use context hook to get connection and multisig address
        const context = await useMcpContext({
          requireWallet: true,
          requireMultisig: true,
        });

        if (
          !context.success ||
          !context.keypair ||
          !context.multisigAddress ||
          !context.connection
        ) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get multisig context",
              },
            ],
          };
        }

        const { connection, keypair, multisigAddress } = context;

        // Fund the multisig with SOL
        const fundRes = await MultisigService.fundSolanaToMultisig(
          connection,
          keypair,
          multisigAddress!,
          amount
        );

        if (!fundRes.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to fund multisig: ${fundRes.error?.message}\n\nSuggestion: Ensure you have enough SOL in your wallet to cover both the amount and transaction fees`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text:
                `Successfully funded multisig with ${amount} SOL!\n\nWhat's next:\n` +
                "1. Create a transaction with 'createMultisigTransaction'\n" +
                "2. Check your multisig balance with 'multisigInfo'\n" +
                "3. You can add more funds anytime with this command",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to fund multisig: ${error}\n\nSuggestion: Check your network connection and wallet balance. You must have more SOL than the amount you're trying to fund plus fees.`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "setMultisigAddress",
    "Sets the active standalone multisig address",
    {
      address: z.string().min(32).max(44),
    },
    async ({ address }) => {
      try {
        // Validate the address
        let multisigAddress: PublicKey;
        try {
          multisigAddress = new PublicKey(address);
        } catch (e) {
          return {
            content: [
              {
                type: "text",
                text: "Invalid multisig address.\n\nSuggestion: Use a valid Solana address, or create a new multisig with 'createMultisig'",
              },
            ],
          };
        }

        // Get connection using the context hook
        const context = await useMcpContext({ requireWallet: false });
        if (!context.success || !context.connection) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to establish connection",
              },
            ],
          };
        }

        const connection = context.connection;

        // Verify this is a valid multisig
        const multisigInfoRes = await MultisigService.getMultisigInfo(
          connection,
          multisigAddress
        );

        if (!multisigInfoRes.success || !multisigInfoRes.data) {
          return {
            content: [
              {
                type: "text",
                text: "This doesn't appear to be a valid Squads multisig address.",
              },
            ],
          };
        }

        // Set as active multisig
        const configRes = await ConfigService.setActiveSquadsMultisig(address);
        if (!configRes.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to set multisig address: ${configRes.error?.message}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully set standalone multisig to: ${address}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to set multisig address: ${error}\n\nSuggestion: Try 'createMultisig' to create a new multisig instead`,
            },
          ],
        };
      }
    }
  );

  // Update the multisigInfo function (around line 279)
  server.tool(
    "multisigInfo",
    "Get information about the configured standalone multisig",
    {},
    async () => {
      try {
        // Use context hook to get connection and multisig address
        const context = await useMcpContext({ requireMultisig: true });
        if (
          !context.success ||
          !context.connection ||
          !context.multisigAddress
        ) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get multisig context",
              },
            ],
          };
        }

        const { connection, multisigAddress } = context;

        // Get multisig info
        const multisigInfoRes = await MultisigService.getMultisigInfo(
          connection,
          multisigAddress!
        );

        if (!multisigInfoRes.success || !multisigInfoRes.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to retrieve multisig info: ${multisigInfoRes.error?.message}`,
              },
            ],
          };
        }

        // Get vault info
        const vaultPdaRes = MultisigService.getMultisigVaultPda(
          multisigAddress!
        );
        if (!vaultPdaRes.success || !vaultPdaRes.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to get vault info: ${vaultPdaRes.error?.message}`,
              },
            ],
          };
        }

        // Get assets held by the multisig
        const solBalance = await connection.getBalance(vaultPdaRes.data);
        const [classicTokens, t22Tokens] = await Promise.all([
          connection.getParsedTokenAccountsByOwner(vaultPdaRes.data, {
            programId: TOKEN_PROGRAM_ID,
          }),
          connection.getParsedTokenAccountsByOwner(vaultPdaRes.data, {
            programId: TOKEN_2022_PROGRAM_ID,
          }),
        ]);

        const allTokens = [...classicTokens.value, ...t22Tokens.value];

        // Enhanced token information with metadata
        const tokenDetails = await Promise.all(
          allTokens.map(async (token) => {
            const mintKey = new PublicKey(token.account.data.parsed.info.mint);
            const tokenInfoResult = await getTokenInfo(
              connection,
              mintKey,
              token.account.owner
            );

            return {
              pubkey: token.pubkey.toBase58(),
              mint: token.account.data.parsed.info.mint,
              programId: token.account.owner.toBase58(),
              amount: token.account.data.parsed.info.tokenAmount,
              // Add enhanced details if available
              symbol: tokenInfoResult.success
                ? formatTokenSymbol(
                    tokenInfoResult.data?.metadata,
                    mintKey.toBase58()
                  )
                : undefined,
              name: tokenInfoResult.success
                ? tokenInfoResult.data?.metadata?.name
                : undefined,
              formattedAmount: tokenInfoResult.success
                ? formatTokenAmount(
                    token.account.data.parsed.info.tokenAmount.amount,
                    tokenInfoResult.data?.decimals || 0
                  )
                : token.account.data.parsed.info.tokenAmount.uiAmountString,
            };
          })
        );

        // Format the response
        const info = multisigInfoRes.data;
        const result = {
          address: multisigAddress!.toBase58(),
          vault: vaultPdaRes.data.toBase58(),
          solBalance: `${solBalance / LAMPORTS_PER_SOL} SOL`,
          tokens: tokenDetails,
          members: (info.members || []).map((m) => m.toBase58()),
          memberCount: info.memberCount,
          threshold: info.threshold,
          transactionIndex: info.transactionIndex,
        };

        return {
          content: [
            {
              type: "text",
              text:
                JSON.stringify(result, null, 2) +
                "\n\nAvailable actions:\n" +
                "1. To create a new transaction: 'createMultisigTransaction' (SOL) or 'createMultisigTokenTransaction' (tokens)\n" +
                "2. To view all proposals: 'getMultisigProposals'\n" +
                "3. To add more funds: 'fundSolanaToMultisig' or 'fundMultisigTokenAccount'",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Failed to get multisig info: ${error}` },
          ],
        };
      }
    }
  );

  server.tool(
    "createMultisigTransaction",
    "Create a transaction for the standalone multisig",
    {
      recipient: z.string(),
      amount: z.number(),
      title: z.string().optional().default("SOL Transfer"),
    },
    async ({ recipient, amount, title }) => {
      try {
        // Use context hook to get connection, wallet and multisig address
        const context = await useMcpContext({
          requireWallet: true,
          requireMultisig: true,
        });

        if (
          !context.success ||
          !context.keypair ||
          !context.multisigAddress ||
          !context.connection
        ) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get multisig context",
              },
            ],
          };
        }

        const { connection, keypair, multisigAddress } = context;

        // Parse recipient
        let recipientAddress: PublicKey;
        try {
          recipientAddress = new PublicKey(recipient);
        } catch (e) {
          return {
            content: [{ type: "text", text: "Invalid recipient address." }],
          };
        }

        // Create SOL transfer instruction
        const transferIxRes =
          await MultisigService.getSquadsMultisigSolTransferInstruction(
            connection,
            multisigAddress!,
            amount,
            recipientAddress
          );

        if (!transferIxRes.success || !transferIxRes.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create transfer instruction: ${transferIxRes.error?.message}`,
              },
            ],
          };
        }

        // Create the transaction with proposal
        const txResult = await MultisigService.createTransactionWithProposal(
          connection,
          multisigAddress!,
          keypair,
          [transferIxRes.data],
          title
        );

        if (!txResult.success || !txResult.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create multisig transaction: ${txResult.error?.message}`,
              },
            ],
          };
        }

        const infoRes = await MultisigService.getMultisigInfo(
          connection,
          multisigAddress!
        );

        const result = {
          success: true,
          multisigAddress: multisigAddress!.toBase58(),
          transactionIndex: txResult.data.transactionIndex,
          title: title,
          recipient: recipientAddress.toBase58(),
          amount: amount,
        };

        return {
          content: [
            {
              type: "text",
              text:
                JSON.stringify(result, null, 2) +
                "\n\nTransaction workflow:\n" +
                `1. Share transaction index #${txResult.data.transactionIndex} with other multisig members\n` +
                "2. Other members need to approve with 'approveMultisigTransaction'\n" +
                `3. Once ${
                  infoRes?.data?.threshold || "enough"
                } approvals are collected, execute with 'executeMultisigTransaction'\n` +
                "4. Check proposal status anytime with 'getMultisigProposals'",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create multisig transaction: ${error}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "approveMultisigTransaction",
    "Approve a transaction in the standalone multisig",
    {
      transactionIndex: z.number(),
    },
    async ({ transactionIndex }) => {
      try {
        // Use context hook to get connection, wallet and multisig address
        const context = await useMcpContext({
          requireWallet: true,
          requireMultisig: true,
        });

        if (
          !context.success ||
          !context.keypair ||
          !context.multisigAddress ||
          !context.connection
        ) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get multisig context",
              },
            ],
          };
        }

        const { connection, keypair, multisigAddress } = context;

        // Approve the transaction
        const approveRes = await MultisigService.approveProposal(
          connection,
          keypair,
          multisigAddress!,
          transactionIndex
        );

        if (!approveRes.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to approve transaction: ${approveRes.error?.message}`,
              },
            ],
          };
        }

        // Get status after approval
        const statusRes = await MultisigService.getProposalStatus(
          connection,
          multisigAddress!,
          transactionIndex
        );

        let statusInfo = "";
        if (statusRes.success && statusRes.data) {
          statusInfo = `\nCurrent approvals: ${statusRes.data.approvalCount}/${statusRes.data.threshold}`;
          if (statusRes.data.meetsThreshold) {
            statusInfo += "\nTransaction is ready to execute!";
          }
        }

        return {
          content: [
            {
              type: "text",
              text:
                `Transaction approved successfully! ${statusInfo}\n\n` +
                (statusRes.data?.meetsThreshold
                  ? `Ready to execute! Use 'executeMultisigTransaction' with index ${transactionIndex}`
                  : `Waiting for more approvals. ${
                      (statusRes.data?.threshold ?? 0) -
                      (statusRes.data?.approvalCount ?? 0)
                    } more needed.`),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Failed to approve transaction: ${error}` },
          ],
        };
      }
    }
  );

  server.tool(
    "executeMultisigTransaction",
    "Execute an approved transaction in the standalone multisig",
    {
      transactionIndex: z.number(),
    },
    async ({ transactionIndex }) => {
      try {
        // Use context hook to get connection, wallet and multisig address
        const context = await useMcpContext({
          requireWallet: true,
          requireMultisig: true,
        });

        if (
          !context.success ||
          !context.keypair ||
          !context.multisigAddress ||
          !context.connection
        ) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get multisig context",
              },
            ],
          };
        }

        const { connection, keypair, multisigAddress } = context;

        // Execute the transaction
        const executeRes = await MultisigService.executeMultisigTransaction(
          connection,
          keypair,
          multisigAddress!,
          transactionIndex
        );

        if (!executeRes.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to execute transaction: ${executeRes.error?.message}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text:
                `Transaction executed successfully!\nTx Signature: ${executeRes.data}\n\n` +
                "What's next?\n" +
                "1. Verify the transaction on Solana Explorer\n" +
                "2. Check your multisig's updated balance with 'multisigInfo'\n" +
                "3. Create another transaction with 'createMultisigTransaction'",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Failed to execute transaction: ${error}` },
          ],
        };
      }
    }
  );

  server.tool(
    "rejectMultisigTransaction",
    "Reject a transaction in the standalone multisig",
    {
      transactionIndex: z.number(),
    },
    async ({ transactionIndex }) => {
      try {
        // Use context hook to get connection, wallet and multisig address
        const context = await useMcpContext({
          requireWallet: true,
          requireMultisig: true,
        });

        if (
          !context.success ||
          !context.keypair ||
          !context.multisigAddress ||
          !context.connection
        ) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get multisig context",
              },
            ],
          };
        }

        const { connection, keypair, multisigAddress } = context;

        // Reject the transaction
        const rejectRes = await MultisigService.rejectProposal(
          connection,
          keypair,
          multisigAddress!,
          transactionIndex
        );

        if (!rejectRes.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to reject transaction: ${rejectRes.error?.message}`,
              },
            ],
          };
        }

        // Get status after rejection
        const statusRes = await MultisigService.getProposalStatus(
          connection,
          multisigAddress!,
          transactionIndex
        );

        let statusInfo = "";
        if (statusRes.success && statusRes.data) {
          statusInfo = `\nCurrent approvals: ${statusRes.data.approvalCount}/${statusRes.data.threshold}`;
        }

        return {
          content: [
            {
              type: "text",
              text:
                `Transaction rejected successfully! ${statusInfo}\n\n` +
                "Note: Rejected transactions cannot be executed even if they reach the approval threshold.\n" +
                "To create a new transaction instead, use 'createMultisigTransaction'.",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Failed to reject transaction: ${error}` },
          ],
        };
      }
    }
  );

  server.tool(
    "getMultisigProposals",
    "Get all proposals for the standalone multisig",
    {},
    async () => {
      try {
        // Use context hook to get connection and multisig address
        const context = await useMcpContext({ requireMultisig: true });
        if (
          !context.success ||
          !context.connection ||
          !context.multisigAddress
        ) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get multisig context",
              },
            ],
          };
        }

        const { connection, multisigAddress } = context;

        // Get all proposals
        const proposalsRes = await MultisigService.getAllProposals(
          connection,
          multisigAddress!
        );

        if (!proposalsRes.success || !proposalsRes.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to fetch proposals: ${proposalsRes.error?.message}`,
              },
            ],
          };
        }

        // Format the proposals data
        const formattedProposals = proposalsRes.data.map((item) => {
          const hasProposal = item.proposal !== null;
          return {
            transactionIndex: Number(item.transactionIndex),
            hasProposal: hasProposal,
            approvals: hasProposal ? item.proposal!.approved.length : 0,
            rejections: hasProposal ? item.proposal!.rejected.length : 0,
            status: hasProposal ? "Created" : "No proposal",
          };
        });

        // Get multisig info for threshold
        const infoRes = await MultisigService.getMultisigInfo(
          connection,
          multisigAddress!
        );

        const threshold = infoRes.success ? infoRes.data!.threshold : "unknown";

        const result = {
          multisigAddress: multisigAddress!.toBase58(),
          threshold: threshold,
          totalProposals: formattedProposals.length,
          proposals: formattedProposals,
        };

        return {
          content: [
            {
              type: "text",
              text:
                JSON.stringify(result, null, 2) +
                "\n\nActions you can take:\n" +
                "1. Approve a transaction: 'approveMultisigTransaction <transactionIndex>'\n" +
                "2. Reject a transaction: 'rejectMultisigTransaction <transactionIndex>'\n" +
                "3. Execute a transaction that meets threshold: 'executeMultisigTransaction <transactionIndex>'\n" +
                "4. Create a new transaction: 'createMultisigTransaction'",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to get multisig proposals: ${error}`,
            },
          ],
        };
      }
    }
  );

  // Add these new tools to the existing registerMultisigTools function
  server.tool(
    "createMultisigTokenTransaction",
    "Create a token transfer transaction for the standalone multisig",
    {
      recipient: z.string(),
      tokenMint: z.string(),
      amount: z.number(),
      title: z.string().optional().default("Token Transfer"),
    },
    async ({ recipient, tokenMint, amount, title }) => {
      try {
        // Use context hook to get connection, wallet and multisig address
        const context = await useMcpContext({
          requireWallet: true,
          requireMultisig: true,
        });

        if (
          !context.success ||
          !context.connection ||
          !context.keypair ||
          !context.multisigAddress
        ) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get multisig context",
              },
            ],
          };
        }

        const { connection, keypair, multisigAddress } = context;

        // Parse recipient and token mint addresses
        let recipientAddress: PublicKey;
        let mintAddress: PublicKey;

        try {
          recipientAddress = new PublicKey(recipient);
        } catch (e) {
          return {
            content: [{ type: "text", text: "Invalid recipient address." }],
          };
        }

        try {
          mintAddress = new PublicKey(tokenMint);
        } catch (e) {
          return {
            content: [{ type: "text", text: "Invalid token mint address." }],
          };
        }

        // Create token transfer instructions
        const transferIxRes =
          await MultisigService.getSquadsMultisigTokenTransferInstruction(
            connection,
            multisigAddress!,
            amount,
            recipientAddress,
            mintAddress
          );

        if (!transferIxRes.success || !transferIxRes.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create token transfer instruction: ${transferIxRes.error?.message}`,
              },
            ],
          };
        }

        // Create the transaction with proposal
        const txResult = await MultisigService.createTransactionWithProposal(
          connection,
          multisigAddress!,
          keypair,
          transferIxRes.data, // This is an array of instructions
          title
        );

        if (!txResult.success || !txResult.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to create multisig token transaction: ${txResult.error?.message}`,
              },
            ],
          };
        }

        // Get token info for display
        const tokenInfo = await getMint(connection, mintAddress);
        const tokenDecimals = tokenInfo.decimals;
        const infoRes = await MultisigService.getMultisigInfo(
          connection,
          multisigAddress!
        );

        const result = {
          success: true,
          multisigAddress: multisigAddress!.toBase58(),
          transactionIndex: txResult.data.transactionIndex,
          title: title,
          tokenMint: mintAddress.toBase58(),
          recipient: recipientAddress.toBase58(),
          amount: amount,
          decimals: tokenDecimals,
        };

        return {
          content: [
            {
              type: "text",
              text:
                JSON.stringify(result, null, 2) +
                "\n\nToken transaction workflow:\n" +
                `1. Share transaction index #${txResult.data.transactionIndex} with other multisig members\n` +
                "2. Other members need to approve with 'approveMultisigTransaction'\n" +
                `3. Once ${
                  infoRes?.data?.threshold || "enough"
                } approvals are collected, execute with 'executeMultisigTransaction'\n` +
                "4. Track proposal status with 'getMultisigProposals'",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create multisig token transaction: ${error}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "fundMultisigTokenAccount",
    "Fund the multisig vault with tokens",
    {
      tokenMint: z.string(),
      amount: z.number(),
    },
    async ({ tokenMint, amount }) => {
      try {
        // Use context hook to get connection, wallet and multisig address
        const context = await useMcpContext({
          requireWallet: true,
          requireMultisig: true,
        });

        if (
          !context.success ||
          !context.keypair ||
          !context.multisigAddress ||
          !context.connection
        ) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get multisig context",
              },
            ],
          };
        }

        const { connection, keypair, multisigAddress } = context;

        // Parse token mint address
        let mintAddress: PublicKey;
        try {
          mintAddress = new PublicKey(tokenMint);
        } catch (e) {
          return {
            content: [{ type: "text", text: "Invalid token mint address." }],
          };
        }

        // Get the multisig vault PDA
        const vaultPdaResult = MultisigService.getMultisigVaultPda(
          multisigAddress!
        );
        if (!vaultPdaResult.success || !vaultPdaResult.data) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to get multisig vault: ${vaultPdaResult.error?.message}`,
              },
            ],
          };
        }

        // Fund the token account
        const fundRes = await MultisigService.fundTokenAccount(
          connection,
          keypair,
          mintAddress,
          vaultPdaResult.data,
          amount
        );

        if (!fundRes.success) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to fund token account: ${fundRes.error?.message}`,
              },
            ],
          };
        }

        // Get token info for display
        const tokenInfo = await getMint(connection, mintAddress);
        const tokenSymbol = tokenInfo.address.toBase58().substring(0, 4); // We don't have symbol info directly

        return {
          content: [
            {
              type: "text",
              text:
                `Successfully funded multisig vault with ${amount} ${tokenSymbol}...!\n` +
                `Tx Signature: ${fundRes.data}\n\n` +
                "What's next?\n" +
                "1. Create a token transfer proposal with 'createMultisigTokenTransaction'\n" +
                `2. You can transfer these tokens to any address through the multisig\n` +
                "3. Token transfers require the same approval process as SOL transfers",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to fund multisig token account: ${error}`,
            },
          ],
        };
      }
    }
  );
}
