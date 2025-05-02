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

    // Note: In a real implementation, you'd decode the account data based on your IDL
    // This is a simplified placeholder
    console.log("Fetched account data, implement decoding based on your IDL");
    return accountInfo;
  }

  /**
   * Simulate buying tokens with base token (fee is deducted from input before curve math)
   */
  async simulateBuy(
    bondingCurve: any,
    baseAmount: BN,
    slippageTolerance: number = 0.5
  ): Promise<{
    expectedTokenAmount: BN;
    minTokenAmount: BN;
    priceImpact: number;
    fee: BN;
    willComplete: boolean;
  }> {
    // Calculate fee on input base token
    const currentTime = Math.floor(Date.now() / 1000);
    const fee = this.calculateFee(
      bondingCurve.startTime.toNumber(),
      baseAmount,
      currentTime
    );
    const netBase = baseAmount.sub(fee);

    // Check if this purchase would complete the bonding curve
    const willComplete = this.willCompleteBondingCurve(bondingCurve, netBase);

    // If purchase would exceed token reserves, adjust accordingly
    let adjustedBaseAmount = netBase;
    let tokensReceived: BN;

    if (willComplete && this.wouldExceedTokenReserves(bondingCurve, netBase)) {
      // Last buy case: buy all remaining tokens
      tokensReceived = new BN(bondingCurve.realTokenReserves.toString());
      // Calculate exact net base needed for these tokens
      adjustedBaseAmount = this.getBaseForExactTokens(
        bondingCurve.virtualBaseReserves,
        bondingCurve.virtualTokenReserves,
        tokensReceived
      );
      // Calculate gross base needed (reverse fee math)
      baseAmount = this.grossAmountFromNet(
        adjustedBaseAmount,
        bondingCurve.startTime.toNumber(),
        currentTime
      );
      // Recalculate fee for this gross amount
      const newFee = this.calculateFee(
        bondingCurve.startTime.toNumber(),
        baseAmount,
        currentTime
      );
      // Use these for reporting
      adjustedBaseAmount = baseAmount.sub(newFee);
      tokensReceived = this.getTokensForBuyBase(
        bondingCurve.virtualBaseReserves,
        bondingCurve.virtualTokenReserves,
        adjustedBaseAmount
      );
    } else {
      // Normal case: calculate tokens for given net base
      tokensReceived = this.getTokensForBuyBase(
        bondingCurve.virtualBaseReserves,
        bondingCurve.virtualTokenReserves,
        netBase
      );
    }

    // Calculate price impact using virtual reserves (matches Rust implementation)
    const virtualBase = bondingCurve.virtualBaseReserves;
    const virtualToken = bondingCurve.virtualTokenReserves;
    const spotPrice = this.calculateSpotPrice(
      virtualBase,
      virtualToken,
      bondingCurve.baseDecimals,
      bondingCurve.tokenDecimals
    );
    const executionPrice = adjustedBaseAmount
      .mul(new BN(10 ** bondingCurve.tokenDecimals))
      .div(tokensReceived)
      .div(new BN(10 ** bondingCurve.baseDecimals));
    const priceImpactPercent = this.calculatePriceImpact(
      spotPrice,
      executionPrice
    );

    // Apply slippage tolerance
    const slippageBps = Math.floor(slippageTolerance * 100);
    const minTokenAmount = tokensReceived
      .mul(new BN(10000 - slippageBps))
      .div(new BN(10000));

    return {
      expectedTokenAmount: tokensReceived,
      minTokenAmount,
      priceImpact: priceImpactPercent,
      fee,
      willComplete,
    };
  }

  /**
   * Simulate selling tokens for base token (fee is deducted from output after curve math)
   */
  async simulateSell(
    bondingCurve: any,
    tokenAmount: BN,
    slippageTolerance: number = 0.5
  ): Promise<{
    expectedBaseAmount: BN;
    minBaseAmount: BN;
    priceImpact: number;
    fee: BN;
  }> {
    // Calculate gross base out for tokenAmount
    const grossBase = this.getBaseForSellTokens(
      bondingCurve.virtualBaseReserves,
      bondingCurve.virtualTokenReserves,
      tokenAmount
    );
    if (grossBase.gt(bondingCurve.realBaseReserves)) {
      throw new Error("Not enough base token reserves to fulfill sell request");
    }
    // Calculate fee on output base
    const currentTime = Math.floor(Date.now() / 1000);
    const fee = this.calculateFee(
      bondingCurve.startTime.toNumber(),
      grossBase,
      currentTime
    );
    const netBase = grossBase.sub(fee);

    // Calculate price impact
    const virtualBase = bondingCurve.virtualBaseReserves;
    const virtualToken = bondingCurve.virtualTokenReserves;
    const spotPrice = this.calculateSpotPrice(
      virtualBase,
      virtualToken,
      bondingCurve.baseDecimals,
      bondingCurve.tokenDecimals
    );
    const executionPrice = grossBase
      .mul(new BN(10 ** bondingCurve.tokenDecimals))
      .div(tokenAmount)
      .div(new BN(10 ** bondingCurve.baseDecimals));
    const priceImpactPercent = this.calculatePriceImpact(
      spotPrice,
      executionPrice
    );

    // Apply slippage tolerance
    const slippageBps = Math.floor(slippageTolerance * 100);
    const minBaseAmount = netBase
      .mul(new BN(10000 - slippageBps))
      .div(new BN(10000));

    return {
      expectedBaseAmount: netBase,
      minBaseAmount,
      priceImpact: priceImpactPercent,
      fee,
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
   * Implementation of the get_tokens_for_buy_base function
   */
  private getTokensForBuyBase(
    virtualBaseReserves: BN,
    virtualTokenReserves: BN,
    baseAmount: BN
  ): BN {
    if (baseAmount.isZero()) {
      throw new Error("Base amount cannot be zero");
    }

    try {
      // Convert to strings then BigInts for precision (simulating u128 behavior)
      const baseReservesBigInt = BigInt(virtualBaseReserves.toString());
      const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
      const baseAmountBigInt = BigInt(baseAmount.toString());

      // Calculate constant k = virtual_base * virtual_token
      const k = baseReservesBigInt * tokenReservesBigInt;

      // Calculate new virtual base reserves
      const newVirtualBaseReserves = baseReservesBigInt + baseAmountBigInt;

      // Calculate new virtual token reserves: k / new_base_reserves
      const newVirtualTokenReserves = k / newVirtualBaseReserves;

      // Calculate tokens received
      const tokensReceivedBigInt =
        tokenReservesBigInt - newVirtualTokenReserves;

      return new BN(tokensReceivedBigInt.toString());
    } catch (error) {
      console.error("Error calculating tokens for base:", error);
      throw new Error("Failed to calculate token amount");
    }
  }

  /**
   * Implementation of the get_base_for_sell_tokens function
   */
  private getBaseForSellTokens(
    virtualBaseReserves: BN,
    virtualTokenReserves: BN,
    tokenAmount: BN
  ): BN {
    if (tokenAmount.isZero()) {
      throw new Error("Token amount cannot be zero");
    }

    try {
      // Convert to BigInts for precision (simulating u128 behavior)
      const baseReservesBigInt = BigInt(virtualBaseReserves.toString());
      const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
      const tokenAmountBigInt = BigInt(tokenAmount.toString());

      // Calculate constant k = virtual_base * virtual_token
      const k = baseReservesBigInt * tokenReservesBigInt;

      // Calculate new virtual token reserves
      const newVirtualTokenReserves = tokenReservesBigInt + tokenAmountBigInt;

      // Calculate new virtual base reserves: k / new_token_reserves
      const newVirtualBaseReserves = k / newVirtualTokenReserves;

      // Calculate base received
      const baseReceivedBigInt = baseReservesBigInt - newVirtualBaseReserves;

      return new BN(baseReceivedBigInt.toString());
    } catch (error) {
      console.error("Error calculating base for tokens:", error);
      throw new Error("Failed to calculate base amount");
    }
  }

  /**
   * Implementation of the get_base_for_exact_tokens function
   */
  private getBaseForExactTokens(
    virtualBaseReserves: BN,
    virtualTokenReserves: BN,
    tokenAmount: BN
  ): BN {
    if (tokenAmount.isZero()) {
      throw new Error("Token amount cannot be zero");
    }

    try {
      // Convert to BigInts for precision (simulating u128 behavior)
      const baseReservesBigInt = BigInt(virtualBaseReserves.toString());
      const tokenReservesBigInt = BigInt(virtualTokenReserves.toString());
      const tokenAmountBigInt = BigInt(tokenAmount.toString());

      // Calculate constant k = virtual_base * virtual_token
      const k = baseReservesBigInt * tokenReservesBigInt;

      // Calculate new virtual token reserves after removing tokens
      const newVirtualTokenReserves = tokenReservesBigInt - tokenAmountBigInt;

      if (newVirtualTokenReserves <= BigInt(0)) {
        throw new Error("Token amount exceeds virtual token reserves");
      }

      // Calculate new virtual base reserves: k / new_token_reserves
      const newVirtualBaseReserves = k / newVirtualTokenReserves;

      // Calculate base needed
      const baseNeededBigInt = newVirtualBaseReserves - baseReservesBigInt;

      return new BN(baseNeededBigInt.toString());
    } catch (error) {
      console.error("Error calculating base for exact tokens:", error);
      throw new Error("Failed to calculate base amount");
    }
  }

  /**
   * Calculate fee based on time since curve started (matching Rust implementation)
   */
  private calculateFee(startTime: number, amount: BN, currentTime: number): BN {
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

  /**
   * Helper to reverse fee math: get gross amount from net (for last buy case)
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
   * Helper to get fee bps (basis points) for a given time
   */
  private getFeeBps(startTime: number, currentTime: number): number {
    if (currentTime < startTime) return 0;
    const timeDiff = Math.max(0, currentTime - startTime);
    const slotsPassed = Math.floor(timeDiff / 400);
    let feeBps: number;
    if (slotsPassed < 150) {
      feeBps = 100; // 1%
    } else if (slotsPassed >= 150 && slotsPassed <= 250) {
      const feeBpsRaw = (-8_300_000 * slotsPassed + 2_162_600_000) / 1_000_000;
      feeBps = Math.max(0, Math.min(10000, feeBpsRaw));
    } else {
      feeBps = 100; // 1%
    }
    return feeBps;
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
 * console.log(`Expected tokens: ${buyResult.expectedTokenAmount.toString()}`);
 * console.log(`Min tokens with slippage: ${buyResult.minTokenAmount.toString()}`);
 * console.log(`Price impact: ${buyResult.priceImpact.toFixed(2)}%`);
 * console.log(`Will complete curve: ${buyResult.willComplete}`);
 */
