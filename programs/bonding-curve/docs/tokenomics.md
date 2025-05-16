# Next-Gen Asset CLI: Bonding Curve Tokenomics

## Token and SOL Allocation Model

Our tokenomics model provides a balanced approach to token distribution and SOL allocation that maximizes both treasury funding and long-term liquidity.

### Token Distribution

- **Total Supply**: 100,000,000 tokens
- **Allocation**:
  - **Public Fair Launch**: 50% (50M tokens) - Immediately liquid & tradeable via bonding curve
  - **Locked Reserves**: 20% (20M tokens) - Locked for future ecosystem development
  - **DAO Treasury**: 20% (20M tokens) - Controlled by governance
  - **Burned**: 10% (10M tokens) - For deflationary effect

### SOL Allocation

- **DAO Treasury**: 80% of all raised SOL goes directly to treasury
- **Locked Liquidity**: 20% of raised SOL is used for:
  - Split between Raydium AMM pool and bonding curve
  - LP tokens are minted and locked for a predetermined period
  - DAO governance controls LP tokens after lock period expires

## Bonding Curve Mathematics

Our bonding curve implementation uses a constant product formula with critical adjustments to account for treasury allocation:

### Core Formula

- Constant product: `virtual_sol_reserves * virtual_token_reserves = k`
- **Key Insight**: Virtual token reserves include the full token supply (100M) from day one
- This ensures pricing accurately reflects total eventual supply

### Treasury Allocation Management

- 20% of incoming SOL is allocated to treasury
- Treasury allocations are subtracted from virtual SOL reserves
- This maintains the constant product invariant and prevents pricing errors

### Reserves Management

- **Virtual Reserves**: Used for price calculations
  - Virtual SOL Reserves: Total SOL minus treasury allocations
  - Virtual Token Reserves: Represents the full token supply (not just tradable portion)
- **Real Reserves**: Actual assets held in accounts
  - Real SOL Reserves: Total SOL held by bonding curve
  - Real Token Reserves: Tradable tokens held by bonding curve (50% of supply)

## Implementation Flow

### Initial Setup

1. Deploy bonding curve with:
   - Virtual token reserves = 100,000,000,000,000 (full supply)
   - Real token reserves = 50,000,000,000,000 (50% available for trading)
   - Virtual SOL reserves = 30,000,000,000 (initial pricing parameter)
   - Real SOL reserves = 0 (starting position)

### Fair Launch Phase

1. Users can buy tokens using SOL:

   - SOL flows into bonding curve
   - 20% of incoming SOL is tracked for treasury
   - Users receive tokens from the 50% tradable supply
   - Price increases according to constant product formula

2. Users can sell tokens back to the curve:
   - Tokens flow back to bonding curve
   - Users receive SOL based on constant product formula
   - Treasury allocation is proportionally reduced

### Migration Phase (when fundraising target is reached)

1. Calculate final bonding curve price
2. Transfer 80% of SOL to DAO treasury
3. Split remaining 20% of SOL:
   - Create Raydium AMM pool with portion of SOL and tokens
   - Keep portion in bonding curve for continued liquidity
   - Generate LP tokens and lock them
4. Transfer 20% of token supply to DAO treasury
5. Lock 20% of token supply in reserve contract
6. Burn 10% of token supply
7. Any unsold tokens from the tradable portion are also burned

## Technical Parameters

- Initial virtual SOL reserves: 30,000,000,000 lamports
- Initial virtual token reserves: 100,000,000,000,000 (full supply with decimals)
- Initial real token reserves: 50,000,000,000,000 (50% of supply)
- Token decimals: 6
- Lock duration for LP tokens: 180 days (configurable)

## CLI Command Examples

```bash
# Configure bonding curve with updated parameters
assetCLI token setup-curve --type constant-product \
  --initial-virtual-sol 30000000000 \
  --initial-virtual-tokens 100000000000000 \
  --real-token-reserves 50000000000000 \
  --treasury-allocation 20 \
  --always-liquid true

# Set fundraising target
assetCLI token set-target --sol-amount 1000 --time-window 7d

# Set up migration parameters
assetCLI token setup-migration \
  --treasury-sol-pct 80 \
  --raydium-sol-pct 10 \
  --curve-sol-pct 10 \
  --lock-duration 180d \
  --burn-pct 10 \
  --dao-allocation-pct 20 \
  --lock-reserves-pct 20

# Check current state
assetCLI token curve-status

# Execute migration (when conditions met)
assetCLI token execute-migration --burn-unsold true
```

## Benefits of This Model

1. **Price Stability**: Using full supply in virtual token reserves prevents price shock at migration
2. **Fair Distribution**: Trading begins immediately, allowing early price discovery
3. **Treasury Funding**: 80% of raised SOL goes directly to treasury for project development
4. **Sustainable Liquidity**: 20% of raised SOL ensures continued trading after launch
5. **Value Protection**: Burning 10% of supply creates scarcity and benefits holders
6. **Governance Ready**: DAO receives 20% of token supply for protocol ownership

## Technical Considerations

1. **Mathematical Integrity**: The constant product formula is preserved through all operations
2. **LP Security**: LP tokens are locked to prevent immediate liquidity removal
3. **Compounding Effect**: Burning unsold tokens increases the relative value of all tokens
4. **Price Continuity**: Trading can continue without interruption through migration

```javascript
import { Connection, PublicKey } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import { BN } from "bn.js";

/**
 * Client for interacting with bonding curve calculations
 */
export class BondingCurveClient {
  private program: Program;

  constructor(program: Program) {
    this.program = program;
  }

  /**
   * Fetch bonding curve state
   */
  async fetchBondingCurve(bondingCurvePda: PublicKey) {
    return await this.program.account.bondingCurve.fetch(bondingCurvePda);
  }

  /**
   * Simulate buying tokens with SOL
   */
  async simulateBuy(bondingCurvePda: PublicKey, solAmount: BN, slippageTolerance = 0.5) {
    const bondingCurve = await this.fetchBondingCurve(bondingCurvePda);
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Check if bonding curve is active
    if (currentTime < bondingCurve.startTime.toNumber()) {
      throw new Error("Bonding curve has not started yet");
    }
    
    // Check if complete
    if (bondingCurve.complete) {
      throw new Error("Bonding curve is complete");
    }
    
    // Calculate tokens received using the same formula as the contract
    const tokensReceived = this.getTokensForBuySol(bondingCurve, solAmount);
    if (!tokensReceived) {
      throw new Error("Failed to calculate tokens amount");
    }
    
    // Calculate fee
    const fee = this.calculateFee(bondingCurve, solAmount, currentTime);
    
    // Calculate price impact
    const virtualSol = bondingCurve.virtualSolReserves.toNumber();
    const virtualToken = bondingCurve.virtualTokenReserves.toNumber();
    const spotPrice = virtualSol / virtualToken;
    const executionPrice = solAmount.toNumber() / tokensReceived.toNumber();
    const priceImpactPercent = ((executionPrice / spotPrice) - 1) * 100;
    
    // Apply slippage tolerance
    const minAmountOut = tokensReceived.muln(Math.floor(1000 - slippageTolerance * 10))
      .divn(1000);
    
    return {
      expectedTokenAmount: tokensReceived,
      minTokenAmount: minAmountOut,
      pricePerToken: executionPrice,
      spotPrice,
      priceImpactPercent,
      feeAmount: fee,
      feePercent: (fee.toNumber() / solAmount.toNumber()) * 100,
      remainingSupply: bondingCurve.realTokenReserves.toString(),
      willCompletePool: tokensReceived.gte(bondingCurve.realTokenReserves),
    };
  }

  /**
   * Simulate selling tokens for SOL
   */
  async simulateSell(bondingCurvePda: PublicKey, tokenAmount: BN, slippageTolerance = 0.5) {
    const bondingCurve = await this.fetchBondingCurve(bondingCurvePda);
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Similar validations as buy
    if (currentTime < bondingCurve.startTime.toNumber()) {
      throw new Error("Bonding curve has not started yet");
    }
    
    // Calculate SOL to be received
    const solReceived = this.getSolForSellTokens(bondingCurve, tokenAmount);
    if (!solReceived) {
      throw new Error("Failed to calculate SOL amount");
    }
    
    // Calculate fee 
    const fee = this.calculateFee(bondingCurve, solReceived, currentTime);
    
    // Calculate price impact
    const virtualSol = bondingCurve.virtualSolReserves.toNumber();
    const virtualToken = bondingCurve.virtualTokenReserves.toNumber();
    const spotPrice = virtualSol / virtualToken;
    const executionPrice = solReceived.toNumber() / tokenAmount.toNumber();
    const priceImpactPercent = ((spotPrice / executionPrice) - 1) * 100;
    
    // Apply slippage tolerance
    const minAmountOut = solReceived.sub(fee).muln(Math.floor(1000 - slippageTolerance * 10))
      .divn(1000);
    
    return {
      expectedSolAmount: solReceived.sub(fee), // After subtracting fee
      minSolAmount: minAmountOut,
      pricePerToken: executionPrice,
      spotPrice,
      priceImpactPercent,
      feeAmount: fee,
      feePercent: (fee.toNumber() / solReceived.toNumber()) * 100,
    };
  }

  /**
   * Implement the get_tokens_for_buy_sol function from the contract
   */
  getTokensForBuySol(bondingCurve: any, solAmount: BN): BN | null {
    if (solAmount.eqn(0)) {
      return null;
    }
    
    try {
      // Calculate constant k = virtual_sol * virtual_token
      const k = bondingCurve.virtualSolReserves.mul(bondingCurve.virtualTokenReserves);
      
      // Calculate new virtual SOL reserves
      const newVirtualSolReserves = bondingCurve.virtualSolReserves.add(solAmount);
      
      // Calculate new virtual token reserves: k / new_sol_reserves
      const newVirtualTokenReserves = k.div(newVirtualSolReserves);
      
      // Calculate tokens received
      const tokensReceived = bondingCurve.virtualTokenReserves.sub(newVirtualTokenReserves);
      
      return tokensReceived;
    } catch (error) {
      console.error("Error in token calculation:", error);
      return null;
    }
  }

  /**
   * Implement the get_sol_for_sell_tokens function from the contract
   */
  getSolForSellTokens(bondingCurve: any, tokenAmount: BN): BN | null {
    if (tokenAmount.eqn(0)) {
      return null;
    }
    
    try {
      // Calculate constant k = virtual_sol * virtual_token
      const k = bondingCurve.virtualSolReserves.mul(bondingCurve.virtualTokenReserves);
      
      // Calculate new virtual token reserves
      const newVirtualTokenReserves = bondingCurve.virtualTokenReserves.add(tokenAmount);
      
      // Calculate new virtual SOL reserves: k / new_token_reserves
      const newVirtualSolReserves = k.div(newVirtualTokenReserves);
      
      // Calculate SOL received
      const solReceived = bondingCurve.virtualSolReserves.sub(newVirtualSolReserves);
      
      return solReceived;
    } catch (error) {
      console.error("Error in SOL calculation:", error);
      return null;
    }
  }

  /**
   * Calculate fee based on time since curve started
   */
  calculateFee(bondingCurve: any, amount: BN, currentTimestamp: number): BN {
    const startTime = bondingCurve.startTime.toNumber();
    const timeDiffSeconds = Math.max(0, currentTimestamp - startTime);
    const daysPassed = timeDiffSeconds / 86400; // Convert to days
    
    let feeBps: number;
    
    // Use the same fee logic as your contract
    if (daysPassed < 3) {
      // Phase 1: First 3 days - higher fee
      feeBps = 2000; // 20%
    } else if (daysPassed < 14) {
      // Phase 2: Days 3-14 - linear decrease
      const progress = daysPassed - 3;
      const totalPhase = 11; // 14 - 3
      
      // Linear interpolation between 20% and 1%
      feeBps = 2000 - (progress * (2000 - 100) / totalPhase);
    } else {
      // Phase 3: After 14 days - minimum fee
      feeBps = 100; // 1%
    }
    
    // Cap at 10% maximum
    feeBps = Math.min(feeBps, 1000);
    
    // Calculate fee amount: amount * feeBps / 10000
    return amount.muln(Math.floor(feeBps)).divn(10000);
  }
}
```