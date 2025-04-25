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
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getTokenMetadata,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { ServiceResponse } from "../types/service-types";
import {
  AMM_CONFIG_ID,
  CPMM_PROGRAM_ID,
  METADATA_PROGRAM_ID,
  RAYDIUM_CREATE_POOL_FEE,
  WSOL_ID,
} from "../utils/constants";
import {
  GlobalInitParams,
  CreateBondingCurveParams,
  SwapParams,
  BondingCurveProposal,
  BondingCurveData,
  BondingCurveAndProposalData,
} from "../types";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createGenericFile,
  createSignerFromKeypair,
  publicKey,
  signerIdentity,
} from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import { findMetadataPda } from "@metaplex-foundation/mpl-token-metadata";
import { BondingCurve } from "../types/bonding_curve";

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
    });
    this.idl = idl;
    this.program = new Program(this.idl, this.provider);
  }

  // PDA helpers
  private findGlobalPda(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      new PublicKey(this.idl.address)
    )[0];
  }

  private findMintPda(name: string, creator: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("bonding_curve_token"),
        Buffer.from(name),
        creator.toBuffer(),
      ],
      new PublicKey(this.idl.address)
    )[0];
  }

  private findCurvePda(mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_curve"), mint.toBuffer()],
      new PublicKey(this.idl.address)
    )[0];
  }

  private findVaultPda(mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_curve_vault"), mint.toBuffer()],
      new PublicKey(this.idl.address)
    )[0];
  }

  private findProposalPda(mint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), mint.toBuffer()],
      new PublicKey(this.idl.address)
    )[0];
  }

  private findMetadataPda(mint: PublicKey): PublicKey {
    const umi = createUmi(this.provider.connection);
    const [meta] = findMetadataPda(umi, { mint: publicKey(mint) });
    return new PublicKey(meta.toString());
  }

  private getAssociatedTokenAddress(
    mint: PublicKey,
    owner: PublicKey
  ): PublicKey {
    return getAssociatedTokenAddressSync(mint, owner, true);
  }

  private findPoolStatePda(mint: PublicKey, baseMint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        new PublicKey(AMM_CONFIG_ID).toBuffer(),
        baseMint.toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey(CPMM_PROGRAM_ID)
    )[0];
  }

  private findCpmmAuthorityPda(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault_and_lp_mint_auth_seed")],
      new PublicKey(CPMM_PROGRAM_ID)
    )[0];
  }

  private findObservationStatePda(poolState: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("observation"), poolState.toBuffer()],
      new PublicKey(CPMM_PROGRAM_ID)
    )[0];
  }

  private findLpMintPda(poolState: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("pool_lp_mint"), poolState.toBuffer()],
      new PublicKey(CPMM_PROGRAM_ID)
    )[0];
  }

  private findTokenVaultPda(
    poolState: PublicKey,
    tokenMint: PublicKey
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("pool_vault"), poolState.toBuffer(), tokenMint.toBuffer()],
      new PublicKey(CPMM_PROGRAM_ID)
    )[0];
  }

  /** Initialize the protocol (fee, authority, status) */
  async initialize(params: GlobalInitParams): Promise<ServiceResponse<string>> {
    try {
      const globalPda = this.findGlobalPda();
      const scaledMigrateFeeAmount = params.migrateFeeAmount
        ? params.migrateFeeAmount.mul(new BN(LAMPORTS_PER_SOL))
        : null;
      const tx = await this.program.methods
        .initialize({
          feeReceiver: params.feeReceiver ?? this.provider.wallet.publicKey,
          migrateFeeAmount: scaledMigrateFeeAmount,
          status: params.status ?? { running: {} },
        })
        .accountsPartial({
          admin: this.provider.wallet.publicKey,
          global: globalPda,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();
      return { success: true, data: tx };
    } catch (error: any) {
      return {
        success: false,
        error: { message: `Init failed: ${error}`, details: error },
      };
    }
  }

  /** Create a new bonding curve + DAO proposal */
  async createBondingCurve(
    params: CreateBondingCurveParams
  ): Promise<ServiceResponse<{ tx: string; mintAddress: string }>> {
    try {
      const creator = this.provider.wallet.publicKey;
      const mint = this.findMintPda(params.name, creator);
      const curve = this.findCurvePda(mint);
      const vault = this.findVaultPda(mint);
      const proposal = this.findProposalPda(mint);
      const globalPda = this.findGlobalPda();
      const metadata = this.findMetadataPda(mint);

      // upload metadata if provided
      let uri = ``;
      if (params.buff) {
        try {
          const file = createGenericFile(
            params.buff instanceof ArrayBuffer
              ? new Uint8Array(params.buff)
              : params.buff,
            mint.toString()
          );
          const umi = createUmi(this.provider.connection).use(irysUploader());
          const kp = umi.eddsa.createKeypairFromSecretKey(
            this.provider.wallet.payer!.secretKey!
          );
          umi.use(signerIdentity(createSignerFromKeypair(umi, kp)));
          [uri] = await umi.uploader.upload([file]);
        } catch (uerr) {
          // fallback to provided uri
        }
      }

      const scaledTokenTotalSupply = params.tokenTotalSupply.mul(
        new BN(10).pow(new BN(params.mintDecimals))
      );
      const scaledSolRaiseTarget = params.solRaiseTarget.mul(
        new BN(LAMPORTS_PER_SOL)
      );

      const vaultTokenAccount = this.getAssociatedTokenAddress(mint, vault);
      const tx = await this.program.methods
        .createBondingCurve({
          name: params.name,
          symbol: params.symbol,
          uri,
          solRaiseTarget: scaledSolRaiseTarget,
          decimals: params.mintDecimals,
          tokenTotalSupply: scaledTokenTotalSupply,
          description: params.description,
          treasuryAddress: params.treasuryAddress,
          authorityAddress: params.authorityAddress,
          twitterHandle: params.twitterHandle ?? null,
          discordLink: params.discordLink ?? null,
          websiteUrl: params.websiteUrl ?? null,
          logoUri: params.logoUri ?? null,
          founderName: params.founderName ?? null,
          founderTwitter: params.founderTwitter ?? null,
          bullishThesis: params.bullishThesis ?? null,
        })
        .accountsPartial({
          mint,
          creator,
          bondingCurve: curve,
          bondingCurveVault: vault,
          proposal,
          bondingCurveTokenAccount: vaultTokenAccount,
          global: globalPda,
          metadata,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: new PublicKey(METADATA_PROGRAM_ID),
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      return {
        success: true,
        data: { tx, mintAddress: mint.toBase58() },
      };
    } catch (error: any) {
      return {
        success: false,
        error: { message: `Create failed: ${error}`, details: error },
      };
    }
  }

  /** Swap (buy or sell) */
  async swap(
    mint: PublicKey,
    params: SwapParams
  ): Promise<ServiceResponse<string>> {
    try {
      const user = this.provider.wallet.publicKey;
      const globalPda = this.findGlobalPda();
      const curve = this.findCurvePda(mint);
      const vault = this.findVaultPda(mint);
      const proposal = this.findProposalPda(mint);
      const curveStateRes = await this.getBondingCurve(mint);
      if (!curveStateRes.success) {
        return {
          success: false,
          error: { message: `Curve not found`, details: null },
        };
      }
      const curveState = curveStateRes.data;
      const vaultTokenAccount = this.getAssociatedTokenAddress(mint, vault);
      const userTokenAccount = this.getAssociatedTokenAddress(mint, user);

      const globalState: any = await this.program.account.global.fetch(
        globalPda
      );
      const feeReceiver = globalState.feeReceiver;

      // increase compute units
      const computeIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_000_000,
      });
      let scaledAmountIn = params.amount;
      let scaledMinOutAmount = params.minOutAmount;
      if (params.baseIn) {
        scaledAmountIn = scaledAmountIn.mul(
          new BN(10).pow(new BN(curveState!.tokenDecimals))
        );
        scaledMinOutAmount = scaledMinOutAmount.mul(new BN(LAMPORTS_PER_SOL));
      } else {
        scaledAmountIn = scaledAmountIn.mul(new BN(LAMPORTS_PER_SOL));
        scaledMinOutAmount = scaledMinOutAmount.mul(
          new BN(10).pow(new BN(curveState!.tokenDecimals))
        );
      }

      const swapIx = await this.program.methods
        .swap({
          baseIn: params.baseIn,
          amount: scaledAmountIn,
          minOutAmount: scaledMinOutAmount,
        })
        .accountsPartial({
          user,
          global: globalPda,
          feeReceiver,
          mint,
          bondingCurve: curve,
          bondingCurveVault: vault,
          bondingCurveTokenAccount: vaultTokenAccount,
          userTokenAccount,
          proposal,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          clock: web3.SYSVAR_CLOCK_PUBKEY,
        })
        .instruction();

      const tx = new Transaction().add(computeIx, swapIx);
      const sig = await this.provider.sendAndConfirm(tx);
      return { success: true, data: sig };
    } catch (error: any) {
      return {
        success: false,
        error: { message: `Swap failed: ${error}`, details: error },
      };
    }
  }

  /** Fetch on‑chain curve data */
  async getBondingCurve(
    mint: PublicKey
  ): Promise<ServiceResponse<BondingCurveData>> {
    try {
      const curvePda = this.findCurvePda(mint);
      const data: BondingCurveData =
        await this.program.account.bondingCurve.fetch(curvePda);
      return { success: true, data };
    } catch (error: any) {
      return {
        success: false,
        error: { message: `Fetch curve failed: ${error}`, details: error },
      };
    }
  }

  /** Fetch DAO proposal (new params) */
  async getProposal(
    mint: PublicKey
  ): Promise<ServiceResponse<BondingCurveProposal>> {
    try {
      const proposalPda = this.findProposalPda(mint);
      const p = await this.program.account.proposal.fetch(proposalPda);
      return { success: true, data: p };
    } catch (error: any) {
      return {
        success: false,
        error: { message: `Fetch proposal failed: ${error}`, details: error },
      };
    }
  }

  /** Fetch global settings */
  async getGlobalSettings(): Promise<ServiceResponse<any>> {
    try {
      const globalPda = this.findGlobalPda();
      const data = await this.program.account.global.fetch(globalPda);
      // data.
      return { success: true, data };
    } catch (error: any) {
      return {
        success: false,
        error: { message: `Fetch global failed: ${error}`, details: error },
      };
    }
  }

  /** Fetch metadata */
  async getMetadata(mint: PublicKey): Promise<ServiceResponse<any>> {
    try {
      const data = await getTokenMetadata(
        this.provider.connection,
        mint,
        undefined,
        new PublicKey(TOKEN_PROGRAM_ID)
      );
      return { success: true, data };
    } catch (error: any) {
      return {
        success: false,
        error: { message: `Fetch metadata failed: ${error}`, details: error },
      };
    }
  }

  /** Fetch all tokens/proposal on BondingCurve */
  async fetchAllTokensAndProposalsOnCurve(): Promise<
    ServiceResponse<BondingCurveAndProposalData[]>
  > {
    try {
      const allTokensOnCurve = (
        await this.program.account.bondingCurve.all()
      ).map((p) => p.account);
      const data: BondingCurveAndProposalData[] = await Promise.all(
        allTokensOnCurve.map(async (curve) => {
          const proposalPda = this.findProposalPda(curve.mint);
          const proposal = await this.program.account.proposal.fetch(
            proposalPda
          );
          const metadata = await this.getMetadata(curve.mint);
          return {
            mint: curve.mint,
            bondingCurve: curve,
            proposal,
            metadata,
          };
        })
      );
      return { success: true, data };
    } catch (error: any) {
      return {
        success: false,
        error: { message: `Fetch all tokens failed: ${error}`, details: error },
      };
    }
  }

  /**
   * Simulate buying tokens with SOL without executing a transaction
   */
  async simulateBuy(
    mint: PublicKey,
    solAmount: BN,
    slippageTolerance: number = 0.5
  ): Promise<
    ServiceResponse<{
      expectedTokenAmount: BN;
      minTokenAmount: BN;
      priceImpact: number;
      fee: BN;
      willComplete: boolean;
      tokenDecimals: number;
      spotPrice: BN;
      pricePerToken: number;
    }>
  > {
    try {
      // Get bonding curve data
      const curveResult = await this.getBondingCurve(mint);
      if (!curveResult.success || !curveResult.data) {
        return {
          success: false,
          error: {
            message: "Failed to fetch bonding curve data",
            details: curveResult.error,
          },
        };
      }

      const curve = curveResult.data;

      // Check if this purchase would complete the bonding curve
      const willComplete = this._willCompleteBondingCurve(curve, solAmount);

      // If purchase would exceed token reserves, adjust accordingly
      let adjustedSolAmount = solAmount;
      let tokensReceived: BN;

      if (willComplete && this._wouldExceedTokenReserves(curve, solAmount)) {
        // Last buy case: buy all remaining tokens
        tokensReceived = new BN(curve.realTokenReserves.toString());

        // Calculate exact SOL needed for these tokens
        adjustedSolAmount = this._getSolForExactTokens(
          curve.virtualSolReserves,
          curve.virtualTokenReserves,
          tokensReceived
        );
      } else {
        // Normal case: calculate tokens for given SOL
        tokensReceived = this._getTokensForBuySol(
          curve.virtualSolReserves,
          curve.virtualTokenReserves,
          solAmount
        );
      }

      // Calculate fee
      const currentTime = Math.floor(Date.now() / 1000);
      const fee = this._calculateFee(
        curve.startTime.toNumber(),
        adjustedSolAmount,
        currentTime
      );

      // Calculate price impact using virtual reserves
      const virtualSol = curve.virtualSolReserves;
      const virtualToken = curve.virtualTokenReserves;

      const spotPrice = this._calculateSpotPrice(virtualSol, virtualToken);
      const executionPrice = adjustedSolAmount
        .mul(new BN(10 ** curve.tokenDecimals))
        .div(tokensReceived);

      const priceImpactPercent = this._calculatePriceImpact(
        spotPrice,
        executionPrice
      );

      // Apply slippage tolerance
      const slippageBps = Math.floor(slippageTolerance * 100);
      const minTokenAmount = tokensReceived
        .mul(new BN(10000 - slippageBps))
        .div(new BN(10000));

      // Calculate price per token in SOL
      const tokenDecimalsFactor = Math.pow(10, curve.tokenDecimals);
      const solInDecimal = adjustedSolAmount
        .div(new BN(LAMPORTS_PER_SOL))
        .toNumber();
      const tokensInDecimal = tokensReceived
        .div(new BN(tokenDecimalsFactor))
        .toNumber();
      const pricePerToken =
        tokensInDecimal > 0 ? solInDecimal / tokensInDecimal : 0;

      return {
        success: true,
        data: {
          expectedTokenAmount: tokensReceived,
          minTokenAmount,
          priceImpact: priceImpactPercent,
          fee,
          willComplete,
          tokenDecimals: curve.tokenDecimals,
          spotPrice,
          pricePerToken,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: `Simulation failed: ${error.message}`,
          details: error,
        },
      };
    }
  }

  /**
   * Simulate selling tokens for SOL without executing a transaction
   */
  async simulateSell(
    mint: PublicKey,
    tokenAmount: BN,
    slippageTolerance: number = 0.5
  ): Promise<
    ServiceResponse<{
      expectedSolAmount: BN;
      minSolAmount: BN;
      priceImpact: number;
      fee: BN;
      tokenDecimals: number;
      spotPrice: BN;
      pricePerToken: number;
    }>
  > {
    try {
      // Get bonding curve data
      const curveResult = await this.getBondingCurve(mint);
      if (!curveResult.success || !curveResult.data) {
        return {
          success: false,
          error: {
            message: "Failed to fetch bonding curve data",
            details: curveResult.error,
          },
        };
      }

      const curve = curveResult.data;

      // Calculate SOL received for tokenAmount
      const solReceived = this._getSolForSellTokens(
        curve.virtualSolReserves,
        curve.virtualTokenReserves,
        tokenAmount
      );

      if (solReceived.gt(curve.realSolReserves)) {
        return {
          success: false,
          error: {
            message: "Not enough SOL reserves to fulfill sell request",
            details: null,
          },
        };
      }

      // Calculate fee (on output SOL)
      const currentTime = Math.floor(Date.now() / 1000);
      const fee = this._calculateFee(
        curve.startTime.toNumber(),
        solReceived,
        currentTime
      );

      const netSolReceived = solReceived.sub(fee);

      // Calculate price impact
      const virtualSol = curve.virtualSolReserves;
      const virtualToken = curve.virtualTokenReserves;

      const spotPrice = this._calculateSpotPrice(virtualSol, virtualToken);
      const executionPrice = netSolReceived
        .mul(new BN(10 ** curve.tokenDecimals))
        .div(tokenAmount);

      const priceImpactPercent = this._calculatePriceImpact(
        spotPrice,
        executionPrice
      );

      // Apply slippage tolerance to net output
      const slippageBps = Math.floor(slippageTolerance * 100);
      const minSolAmount = netSolReceived
        .mul(new BN(10000 - slippageBps))
        .div(new BN(10000));

      // Calculate price per token in SOL
      const tokenDecimalsFactor = Math.pow(10, curve.tokenDecimals);
      const solInDecimal = netSolReceived
        .div(new BN(LAMPORTS_PER_SOL))
        .toNumber();
      const tokensInDecimal = tokenAmount
        .div(new BN(tokenDecimalsFactor))
        .toNumber();
      const pricePerToken =
        tokensInDecimal > 0 ? solInDecimal / tokensInDecimal : 0;

      return {
        success: true,
        data: {
          expectedSolAmount: netSolReceived,
          minSolAmount,
          priceImpact: priceImpactPercent,
          fee,
          tokenDecimals: curve.tokenDecimals,
          spotPrice,
          pricePerToken,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: `Simulation failed: ${error.message}`,
          details: error,
        },
      };
    }
  }

  /**
   * Calculate the maximum possible buy for a bonding curve
   */
  async calculateMaxBuy(mint: PublicKey): Promise<
    ServiceResponse<{
      maxSolAmount: BN;
      tokenAmount: BN;
      willComplete: boolean;
      completionReason: string;
    }>
  > {
    try {
      // Get bonding curve data
      const curveResult = await this.getBondingCurve(mint);
      if (!curveResult.success || !curveResult.data) {
        return {
          success: false,
          error: {
            message: "Failed to fetch bonding curve data",
            details: curveResult.error,
          },
        };
      }

      const curve = curveResult.data;

      // Get remaining tokens
      const remainingTokens = curve.realTokenReserves;

      // Calculate SOL needed to buy all remaining tokens
      const maxSolAmount = this._getSolForExactTokens(
        curve.virtualSolReserves,
        curve.virtualTokenReserves,
        remainingTokens
      );

      // Check against raise target if it exists
      let willComplete = true;
      let completionReason = "Would purchase all remaining tokens";

      if (curve.solRaiseTarget.gt(new BN(0))) {
        const solToRaiseTarget = curve.solRaiseTarget.sub(
          curve.realSolReserves
        );
        if (solToRaiseTarget.lt(maxSolAmount)) {
          // We'd hit the raise target first
          completionReason = "Would reach SOL raise target";
        }
      }

      return {
        success: true,
        data: {
          maxSolAmount,
          tokenAmount: remainingTokens,
          willComplete,
          completionReason,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: `Max buy calculation failed: ${error.message}`,
          details: error,
        },
      };
    }
  }

  // Helper functions for simulation (copied from BondingCurveSimulator(programs/bonding-curve/clients/BondingCurveSimulator))
  /**
   * Check if buying a specific amount of tokens would complete the bonding curve
   */
  private _willCompleteBondingCurve(bondingCurve: any, solAmount: BN): boolean {
    // Case 1: Check if the purchase would exceed SOL raise target
    if (bondingCurve.solRaiseTarget.gt(new BN(0))) {
      const potentialSolReserves = bondingCurve.realSolReserves.add(solAmount);
      if (potentialSolReserves.gte(bondingCurve.solRaiseTarget)) {
        return true;
      }
    }

    // Case 2: Check if the purchase would buy all remaining tokens
    return this._wouldExceedTokenReserves(bondingCurve, solAmount);
  }

  /**
   * Check if buying this much SOL would exceed the available token reserves
   */
  private _wouldExceedTokenReserves(bondingCurve: any, solAmount: BN): boolean {
    const tokensReceived = this._getTokensForBuySol(
      bondingCurve.virtualSolReserves,
      bondingCurve.virtualTokenReserves,
      solAmount
    );
    return tokensReceived.gte(bondingCurve.realTokenReserves);
  }

  /**
   * Calculate the spot price (SOL per token) based on virtual reserves
   */
  private _calculateSpotPrice(virtualSol: BN, virtualToken: BN): BN {
    // Convert to strings and then to BigInts for precision
    const solBigInt = BigInt(virtualSol.toString());
    const tokenBigInt = BigInt(virtualToken.toString());

    // Calculate with maximum precision, then convert back to BN
    // Formula: virtual_sol_reserves / virtual_token_reserves
    const result = (solBigInt * BigInt(LAMPORTS_PER_SOL)) / tokenBigInt;
    return new BN(result.toString());
  }

  /**
   * Calculate price impact percentage
   */
  private _calculatePriceImpact(spotPrice: BN, executionPrice: BN): number {
    // Convert to BigInts for precision
    const spotBigInt = BigInt(spotPrice.toString());
    const execBigInt = BigInt(executionPrice.toString());

    // Calculate price impact: (executionPrice / spotPrice - 1) * 100
    if (spotBigInt === BigInt(0)) return 0;

    const impactBigInt =
      (execBigInt * BigInt(10000)) / spotBigInt - BigInt(10000);
    return Number(impactBigInt) / 100;
  }

  /**
   * Implementation of the get_tokens_for_buy_sol function
   */
  private _getTokensForBuySol(
    virtualSolReserves: BN,
    virtualTokenReserves: BN,
    solAmount: BN
  ): BN {
    if (solAmount.isZero()) {
      throw new Error("SOL amount cannot be zero");
    }

    try {
      // Convert to strings then BigInts for precision (simulating u128 behavior)
      const solReservesBigInt = BigInt(virtualSolReserves.toString());
      const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
      const solAmountBigInt = BigInt(solAmount.toString());

      // Calculate constant k = virtual_sol * virtual_token
      const k = solReservesBigInt * tokenReservesBigInt;

      // Calculate new virtual SOL reserves
      const newVirtualSolReserves = solReservesBigInt + solAmountBigInt;

      // Calculate new virtual token reserves: k / new_sol_reserves
      const newVirtualTokenReserves = k / newVirtualSolReserves;

      // Calculate tokens received
      const tokensReceivedBigInt =
        tokenReservesBigInt - newVirtualTokenReserves;

      return new BN(tokensReceivedBigInt.toString());
    } catch (error) {
      console.error("Error calculating tokens for SOL:", error);
      throw new Error("Failed to calculate token amount");
    }
  }

  /**
   * Implementation of the get_sol_for_sell_tokens function
   */
  private _getSolForSellTokens(
    virtualSolReserves: BN,
    virtualTokenReserves: BN,
    tokenAmount: BN
  ): BN {
    if (tokenAmount.isZero()) {
      throw new Error("Token amount cannot be zero");
    }

    try {
      // Convert to BigInts for precision (simulating u128 behavior)
      const solReservesBigInt = BigInt(virtualSolReserves.toString());
      const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
      const tokenAmountBigInt = BigInt(tokenAmount.toString());

      // Calculate constant k = virtual_sol * virtual_token
      const k = solReservesBigInt * tokenReservesBigInt;

      // Calculate new virtual token reserves
      const newVirtualTokenReserves = tokenReservesBigInt + tokenAmountBigInt;

      // Calculate new virtual SOL reserves: k / new_token_reserves
      const newVirtualSolReserves = k / newVirtualTokenReserves;

      // Calculate SOL received
      const solReceivedBigInt = solReservesBigInt - newVirtualSolReserves;

      return new BN(solReceivedBigInt.toString());
    } catch (error) {
      console.error("Error calculating SOL for tokens:", error);
      throw new Error("Failed to calculate SOL amount");
    }
  }

  /**
   * Implementation of the get_sol_for_exact_tokens function
   */
  private _getSolForExactTokens(
    virtualSolReserves: BN,
    virtualTokenReserves: BN,
    tokenAmount: BN
  ): BN {
    if (tokenAmount.isZero()) {
      throw new Error("Token amount cannot be zero");
    }

    try {
      // Convert to BigInts for precision (simulating u128 behavior)
      const solReservesBigInt = BigInt(virtualSolReserves.toString());
      const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
      const tokenAmountBigInt = BigInt(tokenAmount.toString());

      // Calculate constant k = virtual_sol * virtual_token
      const k = solReservesBigInt * tokenReservesBigInt;

      // Calculate new virtual token reserves after removing tokens
      const newVirtualTokenReserves = tokenReservesBigInt - tokenAmountBigInt;

      if (newVirtualTokenReserves <= BigInt(0)) {
        throw new Error("Token amount exceeds virtual token reserves");
      }

      // Calculate new virtual SOL reserves: k / new_token_reserves
      const newVirtualSolReserves = k / newVirtualTokenReserves;

      // Calculate SOL needed
      const solNeededBigInt = newVirtualSolReserves - solReservesBigInt;

      return new BN(solNeededBigInt.toString());
    } catch (error) {
      console.error("Error calculating SOL for exact tokens:", error);
      throw new Error("Failed to calculate SOL amount");
    }
  }

  /**
   * Calculate fee based on time since curve started
   */
  private _calculateFee(
    startTime: number,
    amount: BN,
    currentTime: number
  ): BN {
    if (currentTime < startTime) {
      throw new Error("Current time before curve start time");
    }

    const timeDiff = Math.max(0, currentTime - startTime);
    const slotsPassed = Math.floor(timeDiff / 400); // Convert time diff to slots (400ms per slot)

    let feeBps: number;

    if (slotsPassed < 150) {
      feeBps = 9900; // 99% fee
    } else if (slotsPassed >= 150 && slotsPassed <= 250) {
      // Linear decrease using the exact formula from Rust implementation
      const feeBpsRaw = (-8_300_000 * slotsPassed + 2_162_600_000) / 1_000_000;
      feeBps = Math.max(0, Math.min(10000, feeBpsRaw));
    } else {
      feeBps = 100; // 1% fee
    }

    // Cap at 10% of amount
    const amountBigInt = BigInt(amount.toString());
    const feeBigInt = (amountBigInt * BigInt(feeBps)) / BigInt(10000);
    const capBigInt = amountBigInt / BigInt(10);

    const finalFeeBigInt = feeBigInt < capBigInt ? feeBigInt : capBigInt;
    return new BN(finalFeeBigInt.toString());
  }

  /** Migrate to Raydium and claim LP tokens in a single transaction */
  async migrateToRaydiumAndClaimLpTokens(
    mint: PublicKey
  ): Promise<ServiceResponse<string>> {
    try {
      const creator = this.provider.wallet.publicKey;
      const globalPda = this.findGlobalPda();
      const curve = this.findCurvePda(mint);
      const vault = this.findVaultPda(mint);
      const proposal = this.findProposalPda(mint);

      // Get the global state to get the fee receiver
      const globalState = await this.program.account.global.fetch(globalPda);
      const feeReceiver = globalState.feeReceiver;

      // Get the bonding curve data to check if it's complete
      const curveResult = await this.getBondingCurve(mint);
      if (!curveResult.success || !curveResult.data) {
        return {
          success: false,
          error: { message: "Failed to get bonding curve data", details: null },
        };
      }

      // Check if the bonding curve is complete
      if (!curveResult.data.complete) {
        return {
          success: false,
          error: { message: "Bonding curve is not complete", details: null },
        };
      }

      // Get proposal data to get treasury and authority addresses
      const proposalResult = await this.getProposal(mint);
      if (!proposalResult.success || !proposalResult.data) {
        return {
          success: false,
          error: { message: "Failed to get proposal data", details: null },
        };
      }

      const proposalData = proposalResult.data;
      const treasuryAddress = proposalData.treasuryAddress;
      const authorityAddress = proposalData.authorityAddress;

      // Find related PDAs for Raydium integration
      const baseMint = new PublicKey(WSOL_ID);
      const poolState = this.findPoolStatePda(mint, baseMint);
      const authority = this.findCpmmAuthorityPda();
      const observationState = this.findObservationStatePda(poolState);
      const lpMint = this.findLpMintPda(poolState);
      const token0Vault = this.findTokenVaultPda(poolState, baseMint);
      const token1Vault = this.findTokenVaultPda(poolState, mint);

      // Get token accounts
      const bondingCurveTokenAccount = this.getAssociatedTokenAddress(
        mint,
        vault
      );
      const bondingCurveBaseTokenAccount = this.getAssociatedTokenAddress(
        baseMint,
        vault
      );
      const bondingCurveLpToken = this.getAssociatedTokenAddress(lpMint, vault);
      const proposalTokenAccount = this.getAssociatedTokenAddress(
        mint,
        authorityAddress
      );
      const creatorLpTokenAccount = this.getAssociatedTokenAddress(
        lpMint,
        creator
      );

      // Create the transaction with increased compute units
      const computeIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_000_000,
      });

      // Create Raydium pool instruction
      const createRaydiumPoolIx = await this.program.methods
        .createRaydiumPool()
        .accountsPartial({
          creator,
          global: globalPda,
          feeReceiver,
          tokenMint: mint,
          baseMint,
          bondingCurve: curve,
          bondingCurveTokenAccount,
          bondingCurveBaseTokenAccount,
          proposal,
          proposalTreasury: treasuryAddress,
          proposalAuthority: authorityAddress,
          proposalTokenAccount,
          cpSwapProgram: new PublicKey(CPMM_PROGRAM_ID),
          ammConfig: new PublicKey(AMM_CONFIG_ID),
          authority,
          poolState,
          lpMint,
          bondingCurveLpToken,
          token0Vault,
          token1Vault,
          createPoolFee: new PublicKey(RAYDIUM_CREATE_POOL_FEE),
          observationState,
          tokenProgram: TOKEN_PROGRAM_ID,
          token1Program: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
          bondingCurveVault: vault,
        })
        .instruction();

      // Claim LP tokens instruction
      const claimLpTokensIx = await this.program.methods
        .claimCreatorLp()
        .accountsPartial({
          creator,
          global: globalPda,
          bondingCurve: curve,
          bondingCurveVault: vault,
          lpMint,
          bondingCurveLpTokenAccount: bondingCurveLpToken,
          feeReceiver,
          proposal,
          proposalAuthority: authorityAddress,
          tokenMint: mint,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          creatorLpTokenAccount,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      // Add instructions to transaction
      const tx = new Transaction().add(
        computeIx,
        createRaydiumPoolIx,
        claimLpTokensIx
      );
      const signature = await this.provider.sendAndConfirm(tx, []);

      return { success: true, data: signature };
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: `Migrate to Raydium and claim LP tokens failed: ${error}`,
          details: error,
        },
      };
    }
  }
}
