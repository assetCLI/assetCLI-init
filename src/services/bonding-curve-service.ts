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
import { mockStorage } from "@metaplex-foundation/umi-storage-mock";

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
  async createBondingCurve(params: CreateBondingCurveParams): Promise<
    ServiceResponse<{
      tx: string;
      tokenMintAddress: string;
      baseMintAddress: string;
    }>
  > {
    try {
      const creator = this.provider.wallet.publicKey;
      const tokenMint = this.findMintPda(params.name, creator);
      const curve = this.findCurvePda(tokenMint);
      const vault = this.findVaultPda(tokenMint);
      const proposal = this.findProposalPda(tokenMint);
      const globalPda = this.findGlobalPda();
      const metadata = this.findMetadataPda(tokenMint);

      // upload metadata if provided
      let uri = ``;
      if (params.buff) {
        try {
          const file = createGenericFile(
            params.buff instanceof ArrayBuffer
              ? new Uint8Array(params.buff)
              : params.buff,
            tokenMint.toString()
          );
          const umi = createUmi(this.provider.connection).use(irysUploader());
          const kp = umi.eddsa.createKeypairFromSecretKey(
            this.provider.wallet.payer!.secretKey!
          );
          umi.use(signerIdentity(createSignerFromKeypair(umi, kp)));
          [uri] = await umi.uploader.upload([file]);
        } catch (uerr) {
          // fallback to provided uri
          const umi = createUmi(this.provider.connection).use(mockStorage());
          const kp = umi.eddsa.createKeypairFromSecretKey(
            this.provider.wallet.payer!.secretKey!
          );
          umi.use(signerIdentity(createSignerFromKeypair(umi, kp)));
          const file = createGenericFile(
            params.buff instanceof ArrayBuffer
              ? new Uint8Array(params.buff)
              : params.buff,
            tokenMint.toString()
          );
          [uri] = await umi.uploader.upload([file]);
        }
      }

      const scaledTokenTotalSupply = params.tokenTotalSupply.mul(
        new BN(10).pow(new BN(params.tokenDecimals))
      );
      const scaledBaseRaiseTarget = params.baseRaiseTarget.mul(
        new BN(10).pow(new BN(params.baseDecimals))
      );

      const vaultTokenAccount = this.getAssociatedTokenAddress(
        tokenMint,
        vault
      );
      const tx = await this.program.methods
        .createBondingCurve({
          name: params.name,
          symbol: params.symbol,
          description: params.description,
          baseRaiseTarget: scaledBaseRaiseTarget,
          tokenDecimals: params.tokenDecimals,
          baseDecimals: params.baseDecimals,
          tokenTotalSupply: scaledTokenTotalSupply ?? null,
          twitterHandle: params.twitterHandle ?? null,
          discordLink: params.discordLink ?? null,
          websiteUrl: params.websiteUrl ?? null,
          uri: uri ?? null,
          logoUri: uri ?? null,
          authorityAddress: params.authorityAddress ?? null,
          bullishThesis: params.bullishThesis ?? null,
          founderName: params.founderName ?? null,
          founderTwitter: params.founderTwitter ?? null,
          treasuryAddress: params.treasuryAddress,
        })
        .accountsPartial({
          tokenMint: tokenMint,
          creator,
          bondingCurve: curve,
          bondingCurveVault: vault,
          proposal,
          bondingCurveTokenAccount: vaultTokenAccount,
          global: globalPda,
          baseMint: params.baseMint,
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
        data: {
          tx,
          tokenMintAddress: tokenMint.toBase58(),
          baseMintAddress: params.baseMint.toBase58(),
        },
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
      const globalState: any = await this.program.account.global.fetch(
        globalPda
      );
      const feeReceiver = globalState.feeReceiver;
      if (!curveStateRes.success || !curveStateRes.data) {
        return {
          success: false,
          error: { message: `Curve not found`, details: null },
        };
      }
      const curveState = curveStateRes.data;
      const vaultTokenAccount = this.getAssociatedTokenAddress(mint, vault);
      const userTokenAccount = this.getAssociatedTokenAddress(mint, user);
      const vaultBaseAccount = this.getAssociatedTokenAddress(
        curveState.baseMint,
        vault
      );
      const userBaseAccount = this.getAssociatedTokenAddress(
        curveState.baseMint,
        user
      );
      const feeReceiverBaseAccount = this.getAssociatedTokenAddress(
        curveState.baseMint,
        feeReceiver
      );

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
        scaledMinOutAmount = scaledMinOutAmount.mul(
          new BN(10).pow(new BN(curveState!.baseDecimals))
        );
      } else {
        scaledAmountIn = scaledAmountIn.mul(
          new BN(10).pow(new BN(curveState!.baseDecimals))
        );
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
          tokenMint: mint,
          bondingCurve: curve,
          bondingCurveVault: vault,
          baseMint: curveState!.baseMint,
          bondingCurveTokenAccount: vaultTokenAccount,
          bondingCurveBaseAccount: vaultBaseAccount,
          userBaseAccount: userBaseAccount,
          feeReceiverBaseAccount,
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
          const proposalPda = this.findProposalPda(curve.tokenMint);
          const proposal = await this.program.account.proposal.fetch(
            proposalPda
          );
          const metadata = await this.getMetadata(curve.tokenMint);
          return {
            mint: curve.tokenMint,
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
   * Simulate buying tokens with base token without executing a transaction
   */
  async simulateBuy(
    mint: PublicKey,
    baseAmount: BN,
    slippageTolerance: number = 0.5
  ): Promise<
    ServiceResponse<{
      expectedTokenAmount: BN;
      minTokenAmount: BN;
      priceImpact: number;
      fee: BN;
      willComplete: boolean;
      tokenDecimals: number;
      baseDecimals: number;
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
      const currentTime = Math.floor(Date.now() / 1000);
      // Calculate fee on input base token
      const fee = this._calculateFee(
        curve.startTime.toNumber(),
        baseAmount,
        currentTime
      );
      const netBase = baseAmount.sub(fee);

      // Check if this purchase would complete the bonding curve
      const willComplete = this._willCompleteBondingCurve(curve, netBase);

      // If purchase would exceed token reserves, adjust accordingly
      let adjustedBaseAmount = netBase;
      let tokensReceived: BN;

      if (willComplete && this._wouldExceedTokenReserves(curve, netBase)) {
        // Last buy case: buy all remaining tokens
        tokensReceived = new BN(curve.realTokenReserves.toString());
        // Calculate exact net base needed for these tokens
        adjustedBaseAmount = this._getBaseForExactTokens(
          curve.virtualBaseReserves,
          curve.virtualTokenReserves,
          tokensReceived
        );
        // Calculate gross base needed (reverse fee math)
        const grossBase = this._grossAmountFromNet(
          adjustedBaseAmount,
          curve.startTime.toNumber(),
          currentTime
        );
        // Recalculate fee for this gross amount
        const newFee = this._calculateFee(
          curve.startTime.toNumber(),
          grossBase,
          currentTime
        );
        // Use these for reporting
        adjustedBaseAmount = grossBase.sub(newFee);
        tokensReceived = this._getTokensForBuyBase(
          curve.virtualBaseReserves,
          curve.virtualTokenReserves,
          adjustedBaseAmount
        );
      } else {
        // Normal case: calculate tokens for given net base
        tokensReceived = this._getTokensForBuyBase(
          curve.virtualBaseReserves,
          curve.virtualTokenReserves,
          netBase
        );
      }

      // Calculate price impact using virtual reserves
      const virtualBase = curve.virtualBaseReserves;
      const virtualToken = curve.virtualTokenReserves;
      const spotPrice = this._calculateSpotPrice(
        virtualBase,
        virtualToken,
        curve.baseDecimals,
        curve.tokenDecimals
      );
      const executionPrice = adjustedBaseAmount
        .mul(new BN(10 ** curve.tokenDecimals))
        .div(tokensReceived)
        .div(new BN(10 ** curve.baseDecimals));
      const priceImpactPercent = this._calculatePriceImpact(
        spotPrice,
        executionPrice
      );

      // Apply slippage tolerance
      const slippageBps = Math.floor(slippageTolerance * 100);
      const minTokenAmount = tokensReceived
        .mul(new BN(10000 - slippageBps))
        .div(new BN(10000));

      // Calculate price per token in base
      const tokenDecimalsFactor = Math.pow(10, curve.tokenDecimals);
      const baseDecimalsFactor = Math.pow(10, curve.baseDecimals);
      const baseInDecimal = adjustedBaseAmount
        .div(new BN(baseDecimalsFactor))
        .toNumber();
      const tokensInDecimal = tokensReceived
        .div(new BN(tokenDecimalsFactor))
        .toNumber();
      const pricePerToken =
        tokensInDecimal > 0 ? baseInDecimal / tokensInDecimal : 0;

      return {
        success: true,
        data: {
          expectedTokenAmount: tokensReceived,
          minTokenAmount,
          priceImpact: priceImpactPercent,
          fee,
          willComplete,
          tokenDecimals: curve.tokenDecimals,
          baseDecimals: curve.baseDecimals,
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
   * Simulate selling tokens for base token without executing a transaction
   */
  async simulateSell(
    mint: PublicKey,
    tokenAmount: BN,
    slippageTolerance: number = 0.5
  ): Promise<
    ServiceResponse<{
      expectedBaseAmount: BN;
      minBaseAmount: BN;
      priceImpact: number;
      fee: BN;
      tokenDecimals: number;
      baseDecimals: number;
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
      // Calculate gross base out for tokenAmount
      const grossBase = this._getBaseForSellTokens(
        curve.virtualBaseReserves,
        curve.virtualTokenReserves,
        tokenAmount
      );
      if (grossBase.gt(curve.realBaseReserves)) {
        return {
          success: false,
          error: {
            message: "Not enough base token reserves to fulfill sell request",
            details: null,
          },
        };
      }
      // Calculate fee on output base
      const currentTime = Math.floor(Date.now() / 1000);
      const fee = this._calculateFee(
        curve.startTime.toNumber(),
        grossBase,
        currentTime
      );
      const netBase = grossBase.sub(fee);

      // Calculate price impact
      const virtualBase = curve.virtualBaseReserves;
      const virtualToken = curve.virtualTokenReserves;
      const spotPrice = this._calculateSpotPrice(
        virtualBase,
        virtualToken,
        curve.baseDecimals,
        curve.tokenDecimals
      );
      const executionPrice = grossBase
        .mul(new BN(10 ** curve.tokenDecimals))
        .div(tokenAmount)
        .div(new BN(10 ** curve.baseDecimals));
      const priceImpactPercent = this._calculatePriceImpact(
        spotPrice,
        executionPrice
      );

      // Apply slippage tolerance to net output
      const slippageBps = Math.floor(slippageTolerance * 100);
      const minBaseAmount = netBase
        .mul(new BN(10000 - slippageBps))
        .div(new BN(10000));

      // Calculate price per token in base
      const tokenDecimalsFactor = Math.pow(10, curve.tokenDecimals);
      const baseDecimalsFactor = Math.pow(10, curve.baseDecimals);
      const baseInDecimal = netBase.div(new BN(baseDecimalsFactor)).toNumber();
      const tokensInDecimal = tokenAmount
        .div(new BN(tokenDecimalsFactor))
        .toNumber();
      const pricePerToken =
        tokensInDecimal > 0 ? baseInDecimal / tokensInDecimal : 0;

      return {
        success: true,
        data: {
          expectedBaseAmount: netBase,
          minBaseAmount,
          priceImpact: priceImpactPercent,
          fee,
          tokenDecimals: curve.tokenDecimals,
          baseDecimals: curve.baseDecimals,
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
      maxBaseAmount: BN;
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
      // Calculate base needed to buy all remaining tokens
      const maxBaseAmount = this._getBaseForExactTokens(
        curve.virtualBaseReserves,
        curve.virtualTokenReserves,
        remainingTokens
      );

      // Check against raise target if it exists
      let willComplete = true;
      let completionReason = "Would purchase all remaining tokens";

      if (curve.baseRaiseTarget && curve.baseRaiseTarget.gt(new BN(0))) {
        const baseToRaiseTarget = curve.baseRaiseTarget.sub(
          curve.realBaseReserves
        );
        if (baseToRaiseTarget.lt(maxBaseAmount)) {
          // We'd hit the raise target first
          completionReason = "Would reach base raise target";
        }
      }

      return {
        success: true,
        data: {
          maxBaseAmount,
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
  private _willCompleteBondingCurve(
    bondingCurve: any,
    baseAmount: BN
  ): boolean {
    // Case 1: Check if the purchase would exceed SOL raise target
    if (bondingCurve.solRaiseTarget.gt(new BN(0))) {
      const potentialSolReserves = bondingCurve.realSolReserves.add(baseAmount);
      if (potentialSolReserves.gte(bondingCurve.solRaiseTarget)) {
        return true;
      }
    }

    // Case 2: Check if the purchase would buy all remaining tokens
    return this._wouldExceedTokenReserves(bondingCurve, baseAmount);
  }

  /**
   * Check if buying this much SOL would exceed the available token reserves
   */
  private _wouldExceedTokenReserves(
    bondingCurve: any,
    baseAmount: BN
  ): boolean {
    const tokensReceived = this._getTokensForBuyBase(
      bondingCurve.virtualBaseReserves,
      bondingCurve.virtualTokenReserves,
      baseAmount
    );
    return tokensReceived.gte(bondingCurve.realTokenReserves);
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

      const proposalBaseAccount = this.getAssociatedTokenAddress(
        baseMint,
        proposalData.authorityAddress
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
          bondingCurveBaseAccount: bondingCurveBaseTokenAccount,
          proposalBaseAccount: proposalBaseAccount,
          proposalTreasury: treasuryAddress,
          proposalAuthority: authorityAddress,
          proposalTokenAccount,
          cpSwapProgram: new PublicKey(CPMM_PROGRAM_ID),
          ammConfig: new PublicKey(AMM_CONFIG_ID),
          authority,
          poolState,
          lpMint,
          proposal,
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

  // Add/rename helpers for base-token math
  private _getTokensForBuyBase(
    virtualBaseReserves: BN,
    virtualTokenReserves: BN,
    baseAmount: BN
  ): BN {
    if (baseAmount.isZero()) {
      throw new Error("Base amount cannot be zero");
    }
    try {
      const baseReservesBigInt = BigInt(virtualBaseReserves.toString());
      const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
      const baseAmountBigInt = BigInt(baseAmount.toString());
      const k = baseReservesBigInt * tokenReservesBigInt;
      const newVirtualBaseReserves = baseReservesBigInt + baseAmountBigInt;
      const newVirtualTokenReserves = k / newVirtualBaseReserves;
      const tokensReceivedBigInt =
        tokenReservesBigInt - newVirtualTokenReserves;
      return new BN(tokensReceivedBigInt.toString());
    } catch (error) {
      throw new Error("Failed to calculate token amount");
    }
  }

  private _getBaseForSellTokens(
    virtualBaseReserves: BN,
    virtualTokenReserves: BN,
    tokenAmount: BN
  ): BN {
    if (tokenAmount.isZero()) {
      throw new Error("Token amount cannot be zero");
    }
    try {
      const baseReservesBigInt = BigInt(virtualBaseReserves.toString());
      const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
      const tokenAmountBigInt = BigInt(tokenAmount.toString());
      const k = baseReservesBigInt * tokenReservesBigInt;
      const newVirtualTokenReserves = tokenReservesBigInt + tokenAmountBigInt;
      const newVirtualBaseReserves = k / newVirtualTokenReserves;
      const baseReceivedBigInt = baseReservesBigInt - newVirtualBaseReserves;
      return new BN(baseReceivedBigInt.toString());
    } catch (error) {
      throw new Error("Failed to calculate base amount");
    }
  }

  private _getBaseForExactTokens(
    virtualBaseReserves: BN,
    virtualTokenReserves: BN,
    tokenAmount: BN
  ): BN {
    if (tokenAmount.isZero()) {
      throw new Error("Token amount cannot be zero");
    }
    try {
      const baseReservesBigInt = BigInt(virtualBaseReserves.toString());
      const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
      const tokenAmountBigInt = BigInt(tokenAmount.toString());
      const k = baseReservesBigInt * tokenReservesBigInt;
      const newVirtualTokenReserves = tokenReservesBigInt - tokenAmountBigInt;
      if (newVirtualTokenReserves <= BigInt(0)) {
        throw new Error("Token amount exceeds virtual token reserves");
      }
      const newVirtualBaseReserves = k / newVirtualTokenReserves;
      const baseNeededBigInt = newVirtualBaseReserves - baseReservesBigInt;
      return new BN(baseNeededBigInt.toString());
    } catch (error) {
      throw new Error("Failed to calculate base amount");
    }
  }

  private _grossAmountFromNet(
    net: BN,
    startTime: number,
    currentTime: number
  ): BN {
    const feeBps = this._getFeeBps(startTime, currentTime);
    const denominator = 10000 - feeBps;
    return net.mul(new BN(10000)).div(new BN(denominator));
  }

  private _getFeeBps(startTime: number, currentTime: number): number {
    if (currentTime < startTime) return 0;
    const timeDiff = Math.max(0, currentTime - startTime);
    const slotsPassed = Math.floor(timeDiff / 400);
    let feeBps: number;
    if (slotsPassed < 150) {
      feeBps = 9900; // 99%
    } else if (slotsPassed >= 150 && slotsPassed <= 250) {
      const feeBpsRaw = (-8_300_000 * slotsPassed + 2_162_600_000) / 1_000_000;
      feeBps = Math.max(0, Math.min(10000, feeBpsRaw));
    } else {
      feeBps = 100; // 1%
    }
    return feeBps;
  }

  private _calculateSpotPrice(
    virtualBase: BN,
    virtualToken: BN,
    baseDecimals: number,
    tokenDecimals: number
  ): BN {
    const baseBigInt = BigInt(virtualBase.toString());
    const tokenBigInt = BigInt(virtualToken.toString());
    const result =
      (baseBigInt * BigInt(10 ** tokenDecimals)) /
      (tokenBigInt * BigInt(10 ** baseDecimals));
    return new BN(result.toString());
  }

  private _calculatePriceImpact(spotPrice: BN, executionPrice: BN): number {
    const spotBigInt = BigInt(spotPrice.toString());
    const execBigInt = BigInt(executionPrice.toString());
    if (spotBigInt === BigInt(0)) return 0;
    const impactBigInt =
      (execBigInt * BigInt(10000)) / spotBigInt - BigInt(10000);
    return Number(impactBigInt) / 100;
  }
}
