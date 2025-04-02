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
