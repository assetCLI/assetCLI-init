import { Connection, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

/**
 * Client for simulating bonding curve swaps without executing on-chain transactions
 */
export class BondingCurveSimulator {
  constructor(private connection: Connection) {}

  /**
   * Fetch bonding curve data from the blockchain
   */
  async fetchBondingCurveData(
    bondingCurvePda: PublicKey,
    programId: PublicKey
  ): Promise<any> {
    const accountInfo = await this.connection.getAccountInfo(bondingCurvePda);
    if (!accountInfo) {
      throw new Error("Bonding curve account not found");
    }
    // TODO: Decode accountInfo.data using your IDL layout
    // For now, return raw data
    return accountInfo;
  }

  /**
   * Simulate buying tokens with base token (fee is deducted from input before curve math)
   * Returns: { token_amount, base_amount, price_per_token, fee_amount, willComplete }
   */
  async simulateBuy(
    bondingCurve: any,
    baseAmount: BN,
    slippageTolerance: number = 0.5
  ): Promise<{
    token_amount: BN;
    base_amount: BN;
    price_per_token: number;
    fee_amount: BN;
    willComplete: boolean;
  }> {
    const currentTime = Math.floor(Date.now() / 1000);
    // Fee is calculated on gross baseAmount
    const fee_amount = this.calculateFee(
      bondingCurve.start_time.toNumber(),
      baseAmount,
      currentTime
    );
    let net_base_amount = baseAmount.sub(fee_amount);
    let willComplete = false;
    // Check if this purchase would complete the bonding curve (by base raise or tokens)
    if (
      bondingCurve.base_raise_target.gt(new BN(0)) &&
      bondingCurve.real_base_reserves
        .add(net_base_amount)
        .gte(bondingCurve.base_raise_target)
    ) {
      willComplete = true;
    }
    // Calculate tokens received for net_base_amount
    let token_amount = this.getTokensForBuyBase(
      bondingCurve.virtual_base_reserves,
      bondingCurve.virtual_token_reserves,
      net_base_amount
    );
    // If this would exceed token reserves, adjust for last buy
    if (token_amount.gte(bondingCurve.real_token_reserves)) {
      willComplete = true;
      token_amount = new BN(bondingCurve.real_token_reserves.toString());
      // Calculate net_base_amount needed for exactly these tokens
      net_base_amount = this.getBaseForExactTokens(
        bondingCurve.virtual_base_reserves,
        bondingCurve.virtual_token_reserves,
        token_amount
      );
      // Reverse fee math to get gross baseAmount
      baseAmount = this.grossAmountFromNet(
        net_base_amount,
        bondingCurve.start_time.toNumber(),
        currentTime
      );
      // Recalculate fee for this gross amount
      const new_fee = this.calculateFee(
        bondingCurve.start_time.toNumber(),
        baseAmount,
        currentTime
      );
      net_base_amount = baseAmount.sub(new_fee);
      // token_amount stays the same
    }
    // Calculate price per token
    const price_per_token = token_amount.gt(new BN(0))
      ? Number(net_base_amount.toString()) / Number(token_amount.toString())
      : 0;
    return {
      token_amount,
      base_amount: net_base_amount,
      price_per_token,
      fee_amount,
      willComplete,
    };
  }

  /**
   * Simulate selling tokens for base token (fee is deducted from output after curve math)
   * Returns: { token_amount, base_amount, price_per_token, fee_amount }
   */
  async simulateSell(
    bondingCurve: any,
    tokenAmount: BN,
    slippageTolerance: number = 0.5
  ): Promise<{
    token_amount: BN;
    base_amount: BN;
    price_per_token: number;
    fee_amount: BN;
  }> {
    // Calculate gross base out for tokenAmount
    const gross_base = this.getBaseForSellTokens(
      bondingCurve.virtual_base_reserves,
      bondingCurve.virtual_token_reserves,
      tokenAmount
    );
    if (gross_base.gt(bondingCurve.real_base_reserves)) {
      throw new Error("Not enough base token reserves to fulfill sell request");
    }
    const currentTime = Math.floor(Date.now() / 1000);
    const fee_amount = this.calculateFee(
      bondingCurve.start_time.toNumber(),
      gross_base,
      currentTime
    );
    const net_base = gross_base.sub(fee_amount);
    const price_per_token = tokenAmount.gt(new BN(0))
      ? Number(net_base.toString()) / Number(tokenAmount.toString())
      : 0;
    return {
      token_amount: tokenAmount,
      base_amount: net_base,
      price_per_token,
      fee_amount,
    };
  }

  /**
   * Check if buying a specific amount of tokens would complete the bonding curve
   */
  willCompleteBondingCurve(bondingCurve: any, baseAmount: BN): boolean {
    // Case 1: Check if the purchase would exceed base raise target
    if (bondingCurve.baseRaiseTarget.gt(new BN(0))) {
      const potentialBaseReserves =
        bondingCurve.realBaseReserves.add(baseAmount);
      if (potentialBaseReserves.gte(bondingCurve.baseRaiseTarget)) {
        return true;
      }
    }

    // Case 2: Check if the purchase would buy all remaining tokens
    return this.wouldExceedTokenReserves(bondingCurve, baseAmount);
  }

  /**
   * Check if buying this much base would exceed the available token reserves
   */
  wouldExceedTokenReserves(bondingCurve: any, baseAmount: BN): boolean {
    const tokensReceived = this.getTokensForBuyBase(
      bondingCurve.virtualBaseReserves,
      bondingCurve.virtualTokenReserves,
      baseAmount
    );
    return tokensReceived.gte(bondingCurve.realTokenReserves);
  }

  /**
   * Calculate how much base would be needed to buy all remaining tokens
   */
  calculateBaseForRemainingTokens(bondingCurve: any): BN {
    const remainingTokens = bondingCurve.realTokenReserves;
    return this.getBaseForExactTokens(
      bondingCurve.virtualBaseReserves,
      bondingCurve.virtualTokenReserves,
      remainingTokens
    );
  }

  /**
   * Calculate the spot price (base per token) based on virtual reserves and decimals
   */
  calculateSpotPrice(
    virtualBase: BN,
    virtualToken: BN,
    baseDecimals: number,
    tokenDecimals: number
  ): BN {
    const baseBigInt = BigInt(virtualBase.toString());
    const tokenBigInt = BigInt(virtualToken.toString());
    // Scale for decimals
    const result =
      (baseBigInt * BigInt(10 ** tokenDecimals)) /
      (tokenBigInt * BigInt(10 ** baseDecimals));
    return new BN(result.toString());
  }

  /**
   * Calculate price impact percentage
   */
  calculatePriceImpact(spotPrice: BN, executionPrice: BN): number {
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
   * Implementation of the get_tokens_for_buy_base function (matches Rust)
   */
  private getTokensForBuyBase(
    virtualBaseReserves: BN,
    virtualTokenReserves: BN,
    baseAmount: BN
  ): BN {
    if (baseAmount.isZero()) throw new Error("Base amount cannot be zero");
    const baseReservesBigInt = BigInt(virtualBaseReserves.toString());
    const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
    const baseAmountBigInt = BigInt(baseAmount.toString());
    const k = baseReservesBigInt * tokenReservesBigInt;
    const newVirtualBaseReserves = baseReservesBigInt + baseAmountBigInt;
    const newVirtualTokenReserves = k / newVirtualBaseReserves;
    const tokensReceivedBigInt = tokenReservesBigInt - newVirtualTokenReserves;
    return new BN(tokensReceivedBigInt.toString());
  }

  /**
   * Implementation of the get_base_for_sell_tokens function (matches Rust)
   */
  private getBaseForSellTokens(
    virtualBaseReserves: BN,
    virtualTokenReserves: BN,
    tokenAmount: BN
  ): BN {
    if (tokenAmount.isZero()) throw new Error("Token amount cannot be zero");
    const baseReservesBigInt = BigInt(virtualBaseReserves.toString());
    const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
    const tokenAmountBigInt = BigInt(tokenAmount.toString());
    const k = baseReservesBigInt * tokenReservesBigInt;
    const newVirtualTokenReserves = tokenReservesBigInt + tokenAmountBigInt;
    const newVirtualBaseReserves = k / newVirtualTokenReserves;
    const baseReceivedBigInt = baseReservesBigInt - newVirtualBaseReserves;
    return new BN(baseReceivedBigInt.toString());
  }

  /**
   * Implementation of the get_base_for_exact_tokens function (matches Rust)
   */
  private getBaseForExactTokens(
    virtualBaseReserves: BN,
    virtualTokenReserves: BN,
    tokenAmount: BN
  ): BN {
    if (tokenAmount.isZero()) throw new Error("Token amount cannot be zero");
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
  }

  /**
   * Calculate fee based on time since curve started (matches Rust: 10%→1% linear decay over 7 days)
   */
  private calculateFee(startTime: number, amount: BN, currentTime: number): BN {
    if (currentTime < startTime)
      throw new Error("Current time before curve start time");
    const decayPeriod = 7 * 24 * 60 * 60; // 7 days in seconds
    const startFee = 1000; // 10% in bps
    const minFee = 100; // 1% in bps
    const elapsed = Math.max(0, currentTime - startTime);
    let feeBps: number;
    if (elapsed >= decayPeriod) {
      feeBps = minFee;
    } else {
      const decay = Math.floor(((startFee - minFee) * elapsed) / decayPeriod);
      feeBps = startFee - decay;
    }
    const amountBigInt = BigInt(amount.toString());
    const feeBigInt = (amountBigInt * BigInt(feeBps)) / BigInt(10000);
    return new BN(feeBigInt.toString());
  }

  /**
   * Helper to reverse fee math: get gross amount from net (for last buy case)
   * gross = net * 10000 / (10000 - fee_bps)
   */
  private grossAmountFromNet(
    net: BN,
    startTime: number,
    currentTime: number
  ): BN {
    const feeBps = this.getFeeBps(startTime, currentTime);
    const denominator = 10000 - feeBps;
    return net.mul(new BN(10000)).div(new BN(denominator));
  }

  /**
   * Helper to get fee bps (basis points) for a given time (matches Rust)
   */
  private getFeeBps(startTime: number, currentTime: number): number {
    if (currentTime < startTime) return 0;
    const decayPeriod = 7 * 24 * 60 * 60;
    const startFee = 1000;
    const minFee = 100;
    const elapsed = Math.max(0, currentTime - startTime);
    if (elapsed >= decayPeriod) return minFee;
    const decay = Math.floor(((startFee - minFee) * elapsed) / decayPeriod);
    return startFee - decay;
  }
}

/**
 * Example usage:
 *
 * const connection = new Connection("https://api.mainnet-beta.solana.com");
 * const simulator = new BondingCurveSimulator(connection);
 * const bondingCurvePda = new PublicKey("...");
 * const programId = new PublicKey("...");
 *
 * // Fetch bonding curve data
 * const bondingCurve = await simulator.fetchBondingCurveData(bondingCurvePda, programId);
 *
 * // Simulate buy
 * const buyResult = await simulator.simulateBuy(
 *   bondingCurve,
 *   new BN(1 * LAMPORTS_PER_SOL) // 1 SOL
 * );
 *
 * console.log(`Expected tokens: ${buyResult.token_amount.toString()}`);
 * console.log(`Min tokens with slippage: ${buyResult.base_amount.toString()}`);
 * console.log(`Price impact: ${buyResult.price_per_token.toFixed(2)}%`);
 * console.log(`Will complete curve: ${buyResult.willComplete}`);
 */
