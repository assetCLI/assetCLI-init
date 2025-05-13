import { PublicKey } from "@solana/web3.js";
import { WalletService } from "../services/wallet-service";
import { ConnectionService } from "../services/connection-service";
import { ConfigService } from "../services/config-service";
import { Connection } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { Config } from "../types";

type McpHookOptions = {
  requireWallet?: boolean;
  requireConfig?: boolean;
  requireMultisig?: boolean;
};

type McpHookResult = {
  success: boolean;
  error?: string;
  suggestion?: string;
  connection?: Connection | undefined;
  keypair?: Keypair | undefined;
  config?: Config | undefined;
  multisigAddress?: PublicKey | undefined;
};

/**
 * Utility function that acts like a "hook" for MCP tools
 * Fetches wallet, connection, and configuration in one operation
 */
export async function useMcpContext(
  options: McpHookOptions = {}
): Promise<McpHookResult> {
  const {
    requireWallet = true,
    requireConfig = true,
    requireMultisig = false,
  } = options;

  // Setup connection
  const connectionRes = await ConnectionService.getConnection();
  if (!connectionRes.success || !connectionRes.data) {
    return {
      success: false,
      error: "Failed to establish connection",
      suggestion:
        "Use 'setNetwork' command to set a valid network (devnet, testnet, or mainnet)",
    };
  }
  const connection = connectionRes.data;

  // Get wallet if required
  let keypair = undefined;
  if (requireWallet) {
    const walletRes = await WalletService.loadWallet();
    if (!walletRes.success || !walletRes.data) {
      return {
        success: false,
        error: "No wallet configured. Please create or import a wallet first.",
        suggestion:
          "Use 'createWallet' to create a new wallet or 'importWallet' to import an existing one",
      };
    }
    keypair = WalletService.getKeypair(walletRes.data);
  }

  // Get config if required
  let config = undefined;
  if (requireConfig) {
    const configRes = await ConfigService.getConfig();
    if (!configRes.success || !configRes.data) {
      return {
        success: false,
        error: "Failed to load configuration",
        suggestion: "Use 'setCluster' to initialize your configuration",
      };
    }
    config = configRes.data;
  }

  // Check for standalone multisig if required
  let multisigAddress = undefined;
  if (requireMultisig) {
    const multisigRes = await ConfigService.getActiveSquadsMultisig();
    if (!multisigRes.success || !multisigRes.data) {
      return {
        success: false,
        error: "No standalone multisig configured.",
        suggestion:
          "Use 'createMultisig' to create a new multisig or 'setMultisigAddress' to configure an existing one.",
      };
    }
    multisigAddress = new PublicKey(multisigRes.data);
  }

  return {
    success: true,
    connection,
    keypair,
    config,
    multisigAddress,
  };
}

export function mcpText(text: string, suggestion?: string) {
  let fullText = text;
  if (suggestion) {
    fullText += `\n\nSuggestion: ${suggestion}`;
  }
  return {
    content: [{ type: "text" as const, text: fullText }],
  };
}

export function mcpError(message: string, suggestion?: string) {
  let text = message;
  if (suggestion) {
    text += `\n\nSuggestion: ${suggestion}`;
  }
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}
