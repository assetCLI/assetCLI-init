import { Connection, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

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
   * Simulate buying tokens with SOL without executing a transaction
   */
  async simulateBuy(
    bondingCurve: any,
    solAmount: BN,
    slippageTolerance: number = 0.5
  ): Promise<{
    expectedTokenAmount: BN;
    minTokenAmount: BN;
    priceImpact: number;
    fee: BN;
    willComplete: boolean;
  }> {
    // Check if this purchase would complete the bonding curve
    const willComplete = this.willCompleteBondingCurve(bondingCurve, solAmount);
    
    // If purchase would exceed token reserves, adjust accordingly
    let adjustedSolAmount = solAmount;
    let tokensReceived: BN;
    
    if (willComplete && this.wouldExceedTokenReserves(bondingCurve, solAmount)) {
      // Last buy case: buy all remaining tokens
      tokensReceived = new BN(bondingCurve.realTokenReserves.toString());
      
      // Calculate exact SOL needed for these tokens
      adjustedSolAmount = this.getSolForExactTokens(
        bondingCurve.virtualSolReserves,
        bondingCurve.virtualTokenReserves,
        tokensReceived
      );
    } else {
      // Normal case: calculate tokens for given SOL
      tokensReceived = this.getTokensForBuySol(
        bondingCurve.virtualSolReserves,
        bondingCurve.virtualTokenReserves,
        solAmount
      );
    }

    // Calculate fee
    const currentTime = Math.floor(Date.now() / 1000);
    const fee = this.calculateFee(
      bondingCurve.startTime.toNumber(),
      adjustedSolAmount,
      currentTime
    );

    // Calculate price impact using virtual reserves (matches Rust implementation)
    const virtualSol = bondingCurve.virtualSolReserves;
    const virtualToken = bondingCurve.virtualTokenReserves;
    
    const spotPrice = this.calculateSpotPrice(virtualSol, virtualToken);
    const executionPrice = new BN(adjustedSolAmount).mul(new BN(10**bondingCurve.tokenDecimals)).div(tokensReceived);
    
    const priceImpactPercent = this.calculatePriceImpact(spotPrice, executionPrice);

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
   * Simulate selling tokens for SOL without executing a transaction
   */
  async simulateSell(
    bondingCurve: any,
    tokenAmount: BN,
    slippageTolerance: number = 0.5
  ): Promise<{
    expectedSolAmount: BN;
    minSolAmount: BN;
    priceImpact: number;
    fee: BN;
  }> {
    // Check if the bonding curve has enough SOL to fulfill the sell request
    const solReceived = this.getSolForSellTokens(
      bondingCurve.virtualSolReserves,
      bondingCurve.virtualTokenReserves,
      tokenAmount
    );

    if (solReceived.gt(bondingCurve.realSolReserves)) {
      throw new Error("Not enough SOL reserves to fulfill sell request");
    }

    // Calculate fee
    const currentTime = Math.floor(Date.now() / 1000);
    const fee = this.calculateFee(
      bondingCurve.startTime.toNumber(),
      solReceived,
      currentTime
    );

    // Calculate price impact
    const virtualSol = bondingCurve.virtualSolReserves;
    const virtualToken = bondingCurve.virtualTokenReserves;
    
    const spotPrice = this.calculateSpotPrice(virtualSol, virtualToken);
    const executionPrice = solReceived.mul(new BN(10**bondingCurve.tokenDecimals)).div(tokenAmount);
    
    const priceImpactPercent = this.calculatePriceImpact(spotPrice, executionPrice);

    // Apply slippage tolerance
    const slippageBps = Math.floor(slippageTolerance * 100);
    const minSolAmount = solReceived
      .mul(new BN(10000 - slippageBps))
      .div(new BN(10000));

    return {
      expectedSolAmount: solReceived,
      minSolAmount,
      priceImpact: priceImpactPercent,
      fee,
    };
  }

  /**
   * Check if buying a specific amount of tokens would complete the bonding curve
   */
  willCompleteBondingCurve(bondingCurve: any, solAmount: BN): boolean {
    // Case 1: Check if the purchase would exceed SOL raise target
    if (bondingCurve.solRaiseTarget.gt(new BN(0))) {
      const potentialSolReserves = bondingCurve.realSolReserves.add(solAmount);
      if (potentialSolReserves.gte(bondingCurve.solRaiseTarget)) {
        return true;
      }
    }

    // Case 2: Check if the purchase would buy all remaining tokens
    return this.wouldExceedTokenReserves(bondingCurve, solAmount);
  }

  /**
   * Check if buying this much SOL would exceed the available token reserves
   */
  wouldExceedTokenReserves(bondingCurve: any, solAmount: BN): boolean {
    const tokensReceived = this.getTokensForBuySol(
      bondingCurve.virtualSolReserves,
      bondingCurve.virtualTokenReserves,
      solAmount
    );
    return tokensReceived.gte(bondingCurve.realTokenReserves);
  }

  /**
   * Calculate how much SOL would be needed to buy all remaining tokens
   */
  calculateSolForRemainingTokens(bondingCurve: any): BN {
    const remainingTokens = bondingCurve.realTokenReserves;
    return this.getSolForExactTokens(
      bondingCurve.virtualSolReserves,
      bondingCurve.virtualTokenReserves,
      remainingTokens
    );
  }

  /**
   * Calculate the spot price (SOL per token) based on virtual reserves
   */
  calculateSpotPrice(virtualSol: BN, virtualToken: BN): BN {
    // Convert to strings and then to BigInts for precision
    const solBigInt = BigInt(virtualSol.toString());
    const tokenBigInt = BigInt(virtualToken.toString());
    
    // Calculate with maximum precision, then convert back to BN
    // Formula: virtual_sol_reserves / virtual_token_reserves
    const result = (solBigInt * BigInt(10**9)) / tokenBigInt;
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
    
    const impactBigInt = ((execBigInt * BigInt(10000)) / spotBigInt) - BigInt(10000);
    return Number(impactBigInt) / 100;
  }

  /**
   * Implementation of the get_tokens_for_buy_sol function
   */
  private getTokensForBuySol(
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
      const tokensReceivedBigInt = tokenReservesBigInt - newVirtualTokenReserves;
      
      return new BN(tokensReceivedBigInt.toString());
    } catch (error) {
      console.error("Error calculating tokens for SOL:", error);
      throw new Error("Failed to calculate token amount");
    }
  }

  /**
   * Implementation of the get_sol_for_sell_tokens function
   */
  private getSolForSellTokens(
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
  private getSolForExactTokens(
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