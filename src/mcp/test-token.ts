import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createAssociatedTokenAccount,
  createMint,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { mcpText, useMcpContext } from "../utils/mcp-hooks";
import {
  createV1,
  findMetadataPda,
  mplTokenMetadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  keypairIdentity,
  percentAmount,
  publicKey,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";

export function registerTestTokenTools(server: McpServer) {
  // Get Test Token
  server.tool(
    "getTestToken",
    "Get test token. This will create a new mint and mint some tokens to the wallet. CAUTION: Never use this in mainnet or mainnet rpc URL",
    {
      name: z.string(),
      symbol: z.string().optional(),
      decimals: z.number().optional(),
      amountToMint: z.number().optional(),
    },
    async ({ name, symbol, decimals, amountToMint }) => {
      try {
        const context = await useMcpContext({
          requireWallet: true,
        });

        if (!context.success || !context.connection || !context.keypair) {
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

        const tokenMetadata = {
          name,
          symbol,
          uri: "https://w7.pngwing.com/pngs/153/594/png-transparent-solana-coin-sign-icon-shiny-golden-symmetric-geometrical-design.png",
        };

        const umi = createUmi(connection)
          .use(mplTokenMetadata())
          .use(mplToolbox());
        umi.use(
          keypairIdentity(
            umi.eddsa.createKeypairFromSecretKey(keypair.secretKey)
          )
        );
        const metadataAddress = await findMetadataPda(umi, {
          mint: publicKey(testToken.toBase58()),
        });
        const metadataTx = await createV1(umi, {
          mint: publicKey(testToken.toBase58()),
          authority: umi.identity,
          payer: umi.identity,
          updateAuthority: umi.identity,
          symbol: tokenMetadata.symbol ?? name.toUpperCase(),
          uri: tokenMetadata.uri,
          name: tokenMetadata.name,
          splTokenProgram: publicKey(TOKEN_PROGRAM_ID),
          sellerFeeBasisPoints: percentAmount(0),
          tokenStandard: TokenStandard.Fungible,
        }).sendAndConfirm(umi);

        const metadataSig = base58.deserialize(metadataTx.signature);

        const receipientTokenAccount = await createAssociatedTokenAccount(
          connection,
          keypair,
          testToken,
          keypair.publicKey
        );

        const mintSig = await mintTo(
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
                  metadata: metadataAddress[0].toString(),
                  transaction: mintSig,
                  metadataTransaction: metadataSig,
                  receipientTokenAccount: receipientTokenAccount.toBase58(),
                  amountInReceipientTokenAccount:
                    receipientTokenAccount.toBase58(),
                  amountMinted: amountToMintToken,
                },
                null,
                2
              ),
            },
            {
              type: "text",
              text: "\n\nCAUTION: This is a test token. Never use this in mainnet or mainnet rpc URL",
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

        if (!context.success || !context.connection || !context.keypair) {
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
            {
              type: "text",
              text: "\n\nCAUTION: This is a test token. Never use this in mainnet or mainnet rpc URL",
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

  server.tool(
    "getTestUSDC",
    "Get test USDC. Only valid for localnet.",
    {},
    async () => {
      try {
        const context = await useMcpContext({
          requireWallet: true,
        });

        if (!context.success || !context.connection || !context.keypair) {
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

        const mint = new PublicKey(
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        );

        const mintInfo = await getMint(connection, mint);
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

        const receipientTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          keypair,
          mint,
          keypair.publicKey,
          true
        );

        const tx = await mintTo(
          connection,
          keypair,
          mint,
          receipientTokenAccount.address,
          keypair.publicKey,
          1000000 * 10 ** 6
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mint: mint.toBase58(),
                  receipientTokenAccount:
                    receipientTokenAccount.address.toBase58(),
                  amountInReceipientTokenAccount:
                    receipientTokenAccount.amount.toString(),
                  transaction: tx,
                },
                null,
                2
              ),
            },
            {
              type: "text",
              text: "\n\nCAUTION: This is a test token. Never use this in mainnet or mainnet rpc URL",
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}}` }],
        };
      }
    }
  );
}
