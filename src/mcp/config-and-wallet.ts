import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConfigService } from "../services/config-service";
import { WalletService } from "../services/wallet-service";
import { mcpText, useMcpContext } from "../utils/mcp-hooks";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import {
  fetchMetadataFromSeeds,
  Metadata,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi";
export function registerConfigAndWalletTools(server: McpServer) {
  server.tool(
    "setNetwork",
    "Used to set the network to devnet, localnet, or mainnet. Network is nothing but the rpc url",
    {
      network: z.string(),
    },
    async ({ network }) => {
      try {
        if (network === "devnet") {
          await ConfigService.setNetwork("devnet");
        } else if (network === "localnet") {
          await ConfigService.setNetwork("localnet");
        } else if (network === "mainnet") {
          await ConfigService.setNetwork("mainnet");
        } else {
          return {
            content: [{ type: "text", text: `Invalid network: ${network}` }],
          };
        }
        return {
          content: [{ type: "text", text: `Network set to ${network}` }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to set network: ${error}` }],
        };
      }
    }
  );

  server.tool(
    "showConfig",
    "Displays the current configuration of the assetCLI",
    {},
    async () => {
      try {
        const configRes = await ConfigService.getConfig();
        if (!configRes.success) {
          return {
            content: [{ type: "text", text: "Failed to load configuration" }],
          };
        }
        return {
          content: [
            { type: "text", text: JSON.stringify(configRes.data, null, 2) },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to get config: ${error}` }],
        };
      }
    }
  );

  server.tool(
    "importWallet",
    "Used to import a wallet from a path/Base64 encoded string",
    {
      wallet: z.string(),
    },
    async ({ wallet }) => {
      try {
        const response = await WalletService.importWallet(wallet);
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Failed to import wallet: ${error}` },
          ],
        };
      }
    }
  );

  server.tool("showWallet", "Displays the current wallet", {}, async () => {
    try {
      // Only need connection
      const context = await useMcpContext({
        requireWallet: true,
        requireConfig: false,
      });

      if (!context.success || !context.connection || !context.keypair) {
        return {
          content: [
            { type: "text", text: context.error || "Failed to get context" },
          ],
        };
      }
      const connection = context.connection;
      const wallet = context.keypair;
      const solBalance = await connection.getBalance(wallet.publicKey);
      const [classicTokens, t22Tokens] = await Promise.all([
        context.connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
          programId: TOKEN_PROGRAM_ID,
        }),
        context.connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      ]);
      const umi = createUmi(connection).use(mplTokenMetadata());
      const allTokens = [...classicTokens.value, ...t22Tokens.value];
      let mintsForWhichMetadataFailed: string[] = [];
      const allTokensMints = await Promise.all(
        allTokens.map(async (token) => {
          const mintKey = new PublicKey(token.account.data.parsed.info.mint);
          const mintInfo = await getMint(
            connection,
            mintKey,
            "confirmed",
            token.account.owner
          );
          let metadata: Metadata | undefined = undefined;
          try {
            metadata = await fetchMetadataFromSeeds(umi, {
              mint: publicKey(mintKey),
            });
          } catch (e) {
            mintsForWhichMetadataFailed.push(mintKey.toBase58());
          }
          return {
            mintInfo,
            metadata,
            token,
          };
        })
      );
      return mcpText(
        `{
        "wallet":${wallet.publicKey.toBase58()},
        "solBalance":${solBalance / LAMPORTS_PER_SOL} SOL,
        "tokens":${JSON.stringify(
          allTokensMints.map(({ mintInfo, metadata, token }) => ({
            pubkey: token.pubkey.toBase58(),
            mint: {
              ...mintInfo,
              supply: mintInfo.supply.toString(),
            },
            metadata: {
              name: metadata?.name,
              symbol: metadata?.symbol,
              uri: metadata?.uri,
            },
            programId: token.account.owner.toBase58(),
            amount: token.account.data.parsed.info.tokenAmount,
          }))
        )},
        }`,
        `Metadata fetch failed for mints: ${mintsForWhichMetadataFailed.join(
          `, `
        )}. `
      );
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to show wallet: ${error}` }],
      };
    }
  });

  server.tool("createWallet", "Creates a new wallet", {}, async () => {
    try {
      // Create new wallet
      const walletRes = await WalletService.createWallet();
      if (!walletRes.success || !walletRes.data) {
        return {
          content: [{ type: "text", text: "Failed to create wallet" }],
        };
      }

      // Get context to use connection
      const context = await useMcpContext({
        requireWallet: false,
        requireConfig: false,
      });

      if (!context.success || !context.connection) {
        return {
          content: [
            { type: "text", text: context.error || "Failed to get context" },
          ],
        };
      }

      // Get wallet info with balance
      const walletInfoRes = await WalletService.getWalletInfo(
        context.connection
      );
      if (!walletInfoRes.success) {
        return {
          content: [
            { type: "text", text: "Wallet created but couldn't retrieve info" },
          ],
        };
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(walletInfoRes.data, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to create wallet: ${error}` }],
      };
    }
  });

  server.tool(
    "resetConfig",
    "Resets the config to default values",
    {},
    async () => {
      try {
        const response = await ConfigService.resetConfig();
        if (!response.success) {
          return {
            content: [{ type: "text", text: "Failed to reset config" }],
          };
        }
        return {
          content: [{ type: "text", text: "Config reset to default values" }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to reset config: ${error}` }],
        };
      }
    }
  );
}
