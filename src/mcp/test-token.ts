import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createAssociatedTokenAccount,
  createMint,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useMcpContext } from "../utils/mcp-hooks";

export function registerTestTokenTools(server: McpServer) {
  // Get Test Token
  server.tool(
    "getTestToken",
    "Get test token",
    {
      decimals: z.number().optional(),
      amountToMint: z.number().optional(),
    },
    async ({ decimals, amountToMint }) => {
      try {
        const context = await useMcpContext({
          requireWallet: true,
        });

        if (!context.success) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get context",
              },
            ],
          };
        }

        const { connection, keypair } = context;
        const decimalsOfToken = decimals ? decimals : 6;
        const amountToMintToken = amountToMint ? amountToMint : 10;

        const testToken = await createMint(
          connection,
          keypair,
          keypair.publicKey,
          null,
          decimalsOfToken
        );

        const receipientTokenAccount = await createAssociatedTokenAccount(
          connection,
          keypair,
          testToken,
          keypair.publicKey
        );

        const tx = await mintTo(
          connection,
          keypair,
          testToken,
          receipientTokenAccount,
          keypair.publicKey,
          amountToMintToken * 10 ** decimalsOfToken
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mint: testToken.toBase58(),
                  receipientTokenAccount: receipientTokenAccount.toBase58(),
                  transaction: tx,
                  amountMinted: amountToMintToken,
                  decimals: decimalsOfToken,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error: ${(error as Error).message}` },
          ],
        };
      }
    }
  );

  // Mint more test token
  server.tool(
    "mintMoreTestToken",
    "Mint more test token",
    {
      mint: z.string(),
      receipint: z.string().optional(),
      amountToMint: z.number(),
    },
    async ({ mint, receipint, amountToMint }) => {
      try {
        const context = await useMcpContext({
          requireWallet: true,
        });

        if (!context.success) {
          return {
            content: [
              {
                type: "text",
                text: context.error || "Failed to get context",
              },
            ],
          };
        }

        const { connection, keypair } = context;

        // Validate mint address
        let mintPubkey: PublicKey;
        try {
          mintPubkey = new PublicKey(mint);
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: "Invalid mint address",
              },
            ],
          };
        }

        const mintInfo = await getMint(connection, mintPubkey);
        if (!mintInfo) {
          return {
            content: [
              {
                type: "text",
                text: "Mint not found",
              },
            ],
          };
        }

        // Get recipient address
        const receipintPubkey = receipint
          ? new PublicKey(receipint)
          : keypair.publicKey;

        const receipientTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          keypair,
          mintPubkey,
          receipintPubkey,
          true
        );

        const tx = await mintTo(
          connection,
          keypair,
          mintPubkey,
          receipientTokenAccount.address,
          keypair.publicKey,
          amountToMint * 10 ** mintInfo.decimals
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mint: mint,
                  recipient: receipintPubkey.toBase58(),
                  receipientTokenAccount:
                    receipientTokenAccount.address.toBase58(),
                  amountInReceipientTokenAccount:
                    receipientTokenAccount.amount.toString(),
                  transaction: tx,
                  amountMinted: amountToMint,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error: ${(error as Error).message}` },
          ],
        };
      }
    }
  );
}
