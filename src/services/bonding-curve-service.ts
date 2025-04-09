import {
  AnchorProvider,
  Program,
  BN,
  web3,
  Idl,
  Wallet,
} from "@coral-xyz/anchor";
import {
  PublicKey,
  Connection,
  Commitment,
  Transaction,
} from "@solana/web3.js";
import os from "os";
import fs from "fs";
import { BondingCurve } from "../types/bonding_curve";
import { findMetadataPda } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createGenericFile,
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";

import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getTokenMetadata,
} from "@solana/spl-token";
import { ServiceResponse } from "../types/service-types";
import { METADATA_PROGRAM_ID } from "../utils/constants";
import {
  BondingCurveDaoProposal,
  BondingCurveInitParams,
  CreateBondingCurveParams,
  SwapParams,
} from "../types";
import path from "path";
import { getSolanaTimestamp } from "../utils/get-solana-timestamp";

export class BondingCurveService {
  private program: Program<BondingCurve>;
  private provider: AnchorProvider;
  private idl: Idl;

  constructor(
    connection: Connection,
    wallet: Wallet,
    commitment: Commitment = "confirmed",
    idl: Idl
  ) {
    this.provider = new AnchorProvider(connection, wallet, {
      commitment,
      skipPreflight: false,
    });

    this.idl = idl;
    this.program = new Program(
      this.idl,
      this.provider
    ) as Program<BondingCurve>;
  }

  /**
   * Find Global State PDA
   */
  private findGlobalStatePda(): PublicKey {
    const [globalStateAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      new PublicKey(this.idl.address)
    );
    return globalStateAddress;
  }

  /**
   * Find Bonding Curve PDA
   */
  private findBondingCurvePda(mintKey: PublicKey): PublicKey {
    const [bondingCurvePda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_curve"), mintKey.toBuffer()],
      new PublicKey(this.idl.address)
    );
    return bondingCurvePda;
  }

  /**
   * Find DAO Proposal PDA
   */
  private findDaoProposalPda(mintKey: PublicKey): PublicKey {
    const [daoProposalPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("dao_proposal"), mintKey.toBuffer()],
      new PublicKey(this.idl.address)
    );
    return daoProposalPda;
  }

  /**
   * Find Metadata Address
   */
  private findMetadataAddress(mintKey: PublicKey): PublicKey {
    const umi = createUmi(this.provider.connection);
    return new PublicKey(
      findMetadataPda(umi, { mint: publicKey(mintKey) })[0].toString()
    );
  }

  /**
   * Find Mint address
   */
  public findMintAddress(name: string, creator: PublicKey): PublicKey {
    const [mintAddress] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("bonding_curve_token"),
        Buffer.from(name),
        creator.toBuffer(),
      ],
      new PublicKey(this.idl.address)
    );
    return mintAddress;
  }

  /**
   * Get Associated Token Address
   */
  private async getAssociatedTokenAddress(
    mint: PublicKey,
    owner: PublicKey,
    allowOwnerOffCurve = true
  ): Promise<PublicKey> {
    return getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve);
  }

  /**
   * Initialize the bonding curve protocol
   */
  async initialize(
    params: BondingCurveInitParams
  ): Promise<ServiceResponse<string>> {
    try {
      const globalStateAddress = this.findGlobalStatePda();

      const tx = await this.program.methods
        .initialize({
          initialVirtualTokenReserves:
            params.initialVirtualTokenReserves || new BN(100_000_000_000_000),
          initialVirtualSolReserves:
            params.initialVirtualSolReserves || new BN(30_000_000_000),
          initialRealTokenReserves:
            params.initialRealTokenReserves || new BN(50_000_000_000_000),
          tokenTotalSupply:
            params.tokenTotalSupply || new BN(100_000_000_000_000),
          mintDecimals: params.mintDecimals || 6,
          migrateFeeAmount: params.migrateFeeAmount || new BN(500),
          feeReceiver: params.feeReceiver || this.provider.wallet.publicKey,
          status: params.status || { running: {} },
          whitelistEnabled: params.whitelistEnabled ?? false,
        })
        .accountsPartial({
          admin: this.provider.wallet.publicKey,
          global: globalStateAddress,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      return {
        success: true,
        data: tx,
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: `Failed to initialize bonding curve protocol: ${error}`,
          details: error,
        },
      };
    }
  }

  /**
   * Create a new bonding curve
   */
  async createBondingCurve(
    params: CreateBondingCurveParams
  ): Promise<
    ServiceResponse<{ tx: string; mintAddress: string; uploadErrors?: any }>
  > {
    try {
      const mintKey = this.findMintAddress(
        params.name,
        this.provider.wallet.publicKey
      );
      // Find all necessary PDAs using helper methods
      const metadataAddress = this.findMetadataAddress(mintKey);
      const bondingCurvePda = this.findBondingCurvePda(mintKey);
      const daoProposalPda = this.findDaoProposalPda(mintKey);
      const globalStateAddress = this.findGlobalStatePda();
      let uploadErrors;
      let uri = "https://avatars.githubusercontent.com/u/84874526?v=4";
      if (params.buff) {
        try {
          const file = createGenericFile(params.buff, mintKey.toString());
          const umi = createUmi(this.provider.connection).use(irysUploader());
          const umiKeypair = umi.eddsa.createKeypairFromSecretKey(
            this.provider.wallet.payer?.secretKey!
          );
          const umiSigner = createSignerFromKeypair(umi, umiKeypair);
          umi.use(signerIdentity(umiSigner));
          [uri] = await umi.uploader.upload([file]);
        } catch (error) {
          uploadErrors = error;
        }
      }

      // Find bonding curve token account
      const bondingCurveTokenAccount = await this.getAssociatedTokenAddress(
        mintKey,
        bondingCurvePda,
        true
      );

      // IMPORTANT: Set start time to at least 1 minute in the future to avoid validation errors
      // This gives enough time for transaction processing
      const currentTime =
        (await getSolanaTimestamp(this.provider.connection)) + 60;
      const startTime = new BN(currentTime);

      // Construct parameters exactly as expected by the contract
      const bondingCurveParams = {
        name: params.name,
        symbol: params.symbol,
        uri: uri,
        startTime: startTime,
        solRaiseTarget: params.solRaiseTarget,
        daoName: params.daoName || params.name,
        daoDescription:
          params.daoDescription ||
          "DAO created from bonding curve using assetCLI",
        realmAddress: params.realmAddress,
        // Use null (not empty strings) for optional fields
        twitterHandle: params.twitterHandle || null,
        discordLink: params.discordLink || null,
        websiteUrl: params.websiteUrl || null,
        logoUri: params.logoUri || null,
        founderName: params.founderName || null,
        founderTwitter: params.founderTwitter || null,
        bullishThesis: params.bullishThesis || null,
      };

      // Just use the .rpc() method directly like in the tests
      const tx = await this.program.methods
        .createBondingCurve(bondingCurveParams)
        .accountsPartial({
          mint: mintKey,
          bondingCurve: bondingCurvePda,
          metadata: metadataAddress,
          bondingCurveTokenAccount: bondingCurveTokenAccount,
          daoProposal: daoProposalPda,
          global: globalStateAddress,
          creator: this.provider.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMetadataProgram: METADATA_PROGRAM_ID,
          rent: web3.SYSVAR_RENT_PUBKEY,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([this.provider.wallet.payer!])
        .rpc({ skipPreflight: true });

      return {
        success: true,
        data: {
          tx,
          mintAddress: mintKey.toString(),
          uploadErrors,
        },
      };
    } catch (error: any) {
      // Enhanced error logging for better debugging
      if (error.logs) {
        // Extract and display the specific error from Anchor program
        const errorLog = error.logs.find(
          (log: any) =>
            log.includes("AnchorError") ||
            log.includes("Error Code") ||
            log.includes("Error Message")
        );
        if (errorLog) {
        }
      }

      return {
        success: false,
        error: {
          message: `Failed to create bonding curve: ${error}`,
          details: error,
        },
      };
    }
  }

  /**
   * Buy or sell tokens using the bonding curve (swap)
   */
  async swap(
    mintKey: PublicKey,
    params: SwapParams
  ): Promise<ServiceResponse<string>> {
    try {
      // Find needed PDAs using helper methods
      const globalStateAddress = this.findGlobalStatePda();
      const bondingCurvePda = this.findBondingCurvePda(mintKey);
      const daoProposalPda = this.findDaoProposalPda(mintKey);

      // Find token accounts
      const bondingCurveTokenAccount = await this.getAssociatedTokenAddress(
        mintKey,
        bondingCurvePda,
        true
      );

      const userTokenAccount = await this.getAssociatedTokenAddress(
        mintKey,
        this.provider.wallet.publicKey,
        false
      );

      // Get fee receiver from global state
      const globalState = await this.program.account.global.fetch(
        globalStateAddress
      );
      const feeReceiver = globalState.feeReceiver;

      // Create modifyComputeUnits instruction
      const modifyComputeUnits = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000, // Increasing to 1M compute units
      });

      // Create the swap instruction
      const swapInstruction = await this.program.methods
        .swap({
          baseIn: !params.baseIn,
          amount: params.amount,
          minOutAmount: params.minOutAmount,
        })
        .accountsPartial({
          user: this.provider.wallet.publicKey,
          global: globalStateAddress,
          feeReceiver: feeReceiver,
          mint: mintKey,
          bondingCurve: bondingCurvePda,
          bondingCurveTokenAccount: bondingCurveTokenAccount,
          userTokenAccount: userTokenAccount,
          daoProposal: daoProposalPda,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          clock: web3.SYSVAR_CLOCK_PUBKEY,
        })
        .instruction();

      // Build and send transaction
      const tx = new Transaction().add(modifyComputeUnits, swapInstruction);
      const signature = await this.provider.sendAndConfirm(tx);

      return {
        success: true,
        data: signature,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Swap failed: ${error}`,
          details: error,
        },
      };
    }
  }

  /**
   * Get bonding curve data
   */
  async getBondingCurve(mintKey: PublicKey): Promise<ServiceResponse<any>> {
    try {
      const bondingCurvePda = this.findBondingCurvePda(mintKey);
      const bondingCurve = await this.program.account.bondingCurve.fetch(
        bondingCurvePda
      );

      return {
        success: true,
        data: bondingCurve,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to get bonding curve data: ${error}`,
          details: error,
        },
      };
    }
  }

  /**
   * Get DAO proposal data
   */
  async getDaoProposal(mintKey: PublicKey): Promise<ServiceResponse<any>> {
    try {
      const daoProposalPda = this.findDaoProposalPda(mintKey);
      const daoProposal = await this.program.account.daoProposal.fetch(
        daoProposalPda
      );

      return {
        success: true,
        data: daoProposal,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to get DAO proposal data: ${error}`,
          details: error,
        },
      };
    }
  }

  /**
   * Get global protocol settings
   */
  async getGlobalSettings(): Promise<ServiceResponse<any>> {
    try {
      const globalStateAddress = this.findGlobalStatePda();
      const globalState = await this.program.account.global.fetch(
        globalStateAddress
      );

      return {
        success: true,
        data: globalState,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Failed to get global settings: ${error}`,
          details: error,
        },
      };
    }
  }

  /**
   * Get tokens on curve
   */
  async getTokensOnCurve(): Promise<
    ServiceResponse<
      {
        mintAddress: PublicKey;
        symbol: string;
        uri: string;
        bondingCurveAddress: PublicKey;
        creator: PublicKey;
        daoProposal: BondingCurveDaoProposal;
        daoProposalAddress: PublicKey;
      }[]
    >
  > {
    try {
      const allBondingCurves = await this.program.account.bondingCurve.all();

      const tokensOnCurve = await Promise.all(
        allBondingCurves.map(async (curve) => {
          const mintAddress = new PublicKey(curve.account.mint);
          const bondingCurveAddress = new PublicKey(curve.publicKey);
          const daoProposalAddress = this.findDaoProposalPda(
            curve.account.mint
          );

          const daoProposalPda = this.findDaoProposalPda(curve.account.mint);

          // Fetch DAO proposal data
          let daoProposal;
          try {
            daoProposal = await this.program.account.daoProposal.fetch(
              daoProposalPda
            );
          } catch (err) {
            daoProposal = {
              name: "Unknown",
              description: "",
              realmAddress: null,
              twitterHandle: null,
              discordLink: null,
              websiteUrl: null,
              bullishThesis: null,
              logoUri: null,
            };
          }

          // Safely fetch metadata - handle errors gracefully
          let metadata = { symbol: "", uri: "" };
          try {
            const tokenMetadata = await getTokenMetadata(
              this.provider.connection,
              mintAddress
            );
            if (tokenMetadata) {
              metadata.symbol = tokenMetadata.symbol || "";
              metadata.uri = tokenMetadata.uri || "";
            }
          } catch (err) {
            // some error here
          }

          return {
            mintAddress,
            bondingCurveAddress,
            creator: curve.account.creator,
            symbol: metadata.symbol,
            uri: metadata.uri,
            daoProposalAddress,
            daoProposal: {
              name: daoProposal.name,
              description: daoProposal.description,
              realmAddress:
                daoProposal.realmAddress ??
                new web3.PublicKey("11111111111111111111111111111111"),
              twitterHandle: daoProposal.twitterHandle || undefined,
              solRaiseTarget: curve.account.solRaiseTarget,
              discordLink: daoProposal.discordLink || undefined,
              websiteUrl: daoProposal.websiteUrl || undefined,
              bullishThesis: daoProposal.bullishThesis || undefined,
              startTime: curve.account.startTime.toNumber() || undefined,
              logoUri: daoProposal.logoUri || undefined,
            },
          };
        })
      );

      return {
        success: true,
        data: tokensOnCurve,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          message: `Failed to get tokens on curve: ${err}`,
          details: err,
        },
      };
    }
  }
}
