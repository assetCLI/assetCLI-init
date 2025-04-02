import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ConfigService } from "../services/config-service";
import { WalletService } from "../services/wallet-service";
import { useMcpContext } from "../utils/mcp-hooks";

export function registerConfigAndWalletTools(server: McpServer) {
  server.tool(
    "setCluster",
    "Used to set the cluster to devnet, testnet, or mainnet. Cluster is nothing but the rpc url",
    {
      cluster: z.string(),
    },
    async ({ cluster }) => {
      try {
        if (cluster === "devnet") {
          await ConfigService.setCluster("devnet");
        } else if (cluster === "testnet") {
          await ConfigService.setCluster("testnet");
        } else if (cluster === "mainnet" || cluster === "mainnet-beta") {
          await ConfigService.setCluster("mainnet-beta");
        } else {
          return {
            content: [{ type: "text", text: `Invalid cluster: ${cluster}` }],
          };
        }
        return {
          content: [{ type: "text", text: `Cluster set to ${cluster}` }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to set cluster: ${error}` }],
        };
      }
    }
  );

  server.tool(
    "showConfig",
    "Displays the current configuration of the daoCLI",
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
        requireWallet: false,
        requireConfig: false,
      });

      if (!context.success) {
        return {
          content: [
            { type: "text", text: context.error || "Failed to get context" },
          ],
        };
      }

      // Get wallet info using the connection
      const walletInfoRes = await WalletService.getWalletInfo(
        context.connection
      );
      if (!walletInfoRes.success) {
        return {
          content: [{ type: "text", text: "Failed to get wallet info" }],
        };
      }

      return {
        content: [
          { type: "text", text: JSON.stringify(walletInfoRes.data, null, 2) },
        ],
      };
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

      if (!context.success) {
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
