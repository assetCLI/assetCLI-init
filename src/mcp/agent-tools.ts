import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ACTIONS,
  Action,
  SolanaAgentKit,
  zodToMCPShape,
} from "solana-agent-kit";
import pkg from "bs58";
const { encode } = pkg;
import { ConnectionService } from "../services/connection-service";
import { WalletService } from "../services/wallet-service";
import { z } from "zod";

/**
 * Creates and registers Solana agent tools on the MCP server
 * @param server The McpServer instance to register tools on
 */
export function registerAgentTools(server: McpServer) {
  const registerActions: Record<string, Action> = {
    getTps: ACTIONS.GET_TPS_ACTION,
    getTokenBalances: ACTIONS.TOKEN_BALANCES_ACTION,
    getTokenInfo: ACTIONS.GET_TOKEN_DATA_ACTION,
    airdrop: ACTIONS.REQUEST_FUNDS_ACTION,
  };

  // Register each action as a tool
  for (const [_key, action] of Object.entries(registerActions)) {
    const { result } = zodToMCPShape(action.schema);

    server.tool(action.name, action.description, result, async (params) => {
      try {
        // Get connection and wallet for each request to ensure they're fresh
        const connectionRes = await ConnectionService.getConnection();
        if (!connectionRes.success || !connectionRes.data) {
          return {
            content: [{ type: "text", text: "Connection failed" }],
          };
        }

        const walletRes = await WalletService.loadWallet();
        if (!walletRes.success || !walletRes.data) {
          return {
            content: [{ type: "text", text: "Wallet not loaded" }],
          };
        }

        const wallet = walletRes.data;
        const keypair = WalletService.getKeypair(wallet);

        // Create SolanaAgentKit for each action to ensure fresh state
        const solanaAgentKit = new SolanaAgentKit(
          encode(keypair.secretKey),
          connectionRes.data.rpcEndpoint,
          {}
        );

        // Execute the action with the params
        const res = await action.handler(solanaAgentKit, params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(res, null, 2),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${e}` }],
        };
      }
    });

    // Add examples as prompts if they exist
    if (action.examples && action.examples.length > 0) {
      server.prompt(
        `${action.name}-examples`,
        "Examples for using this action",
        {
          showIndex: z
            .string()
            .optional()
            .describe("Example index to show (number)"),
        },
        (args) => {
          const showIndex = args.showIndex
            ? parseInt(args.showIndex)
            : undefined;
          const examples = action.examples.flat();
          const selectedExamples =
            typeof showIndex === "number" ? [examples[showIndex]] : examples;

          const exampleText = selectedExamples
            .map(
              (ex, idx) => `
Example ${idx + 1}:
Input: ${JSON.stringify(ex.input, null, 2)}
Output: ${JSON.stringify(ex.output, null, 2)}
Explanation: ${ex.explanation || "No explanation provided"}
            `
            )
            .join("\n");

          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Examples for ${action.name}:\n${exampleText}`,
                },
              },
            ],
          };
        }
      );
    }
  }
}
