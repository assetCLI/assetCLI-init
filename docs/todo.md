# Next-Gen Asset CLI Architecture: Bonding Curve & Token Governance

## 1. Overall Architecture

### Core Components

- **Token Issuance Module**: Custom bonding curve contract for token sales
- **Governance System**: Enhanced SPL Governance with token-weighted voting
- **Treasury Management**: Config-authority based multisig control
- **AI Agent Framework**: On-chain parameters with off-chain execution
- **Liquidity Management**: Migration from curve to Raydium AMM

### Module Structure

```
/services
  /token
    - bonding-curve-service.ts
    - vesting-service.ts
    - token-utilities.ts
    - index.ts
  /governance
    - proposal-service.ts
    - voting-service.ts
    - authority-service.ts
    - index.ts
  /treasury
    - multisig-service.ts
    - treasury-service.ts
    - index.ts
  /ai-agent
    - agent-registry-service.ts
    - parameter-service.ts
    - execution-service.ts
    - index.ts
  /liquidity
    - curve-management-service.ts
    - amm-migration-service.ts
    - index.ts
```

## 2. Tokenomics Model

Our model covers both token and SOL allocation.

- **Total Supply**: 100,000,000 tokens
- **Allocation**:
  - Public Fair Launch: 50% (50M tokens) - Immediately liquid & tradeable via bonding curve
  - Locked Reserves: 20% (20M tokens) - Locked for future ecosystem development
  - DAO Treasury: 20% (20M tokens) - Controlled by governance
  - Burned: 10% (10M tokens) - For deflationary effect

### SOL Allocation

- **DAO Treasury**: 80% of all raised SOL is allocated directly to the treasury
- **Locked Liquidity**: 20% of raised SOL is used to mint LP tokens that are locked for a predetermined period

## Updated Bonding Curve Mathematics

Our bonding curve implementation uses a constant product formula similar to AMMs but with important adjustments to manage treasury allocations properly:

### Core Formula

- Constant product: `virtual_sol_reserves * virtual_token_reserves = k`
- This formula ensures price increases as tokens are purchased
- Pricing is fully deterministic based on reserves

### Treasury Allocation Management

- 20% of all incoming SOL is allocated to treasury
- **Critical Fix**: Treasury allocations are subtracted from virtual SOL reserves
- This maintains the constant product invariant and prevents pricing errors

### Reserves Management

- **Virtual Reserves**: Mathematical constructs used for pricing calculations
  - Virtual SOL Reserves: Total SOL minus treasury allocations
  - Virtual Token Reserves: Tokens available in the bonding curve
- **Real Reserves**: Actual assets held in accounts
  - Real SOL Reserves: Total SOL held by bonding curve
  - Real Token Reserves: Total tokens held by bonding curve

### Selling Tokens

- When users sell tokens, the treasury allocation is proportionally reduced
- This ensures the constant product formula remains valid
- Maximum withdrawal is capped to available (non-treasury) SOL

## Fair Launch Model

- **Public Fair Launch**: Instantly tradeable bonding curve for price discovery
- **Always Liquid**: Participants can buy and sell anytime on the curve
- **Fundraising Target**: Configurable SOL fundraising goal
- **Token Supply Management**:
  - When fundraising target is reached, remaining unsold tokens are burned
  - This increases token scarcity and value for early participants
- **Liquidity Migration**: Move to Raydium AMM with locked liquidity upon reaching target
- **Treasury Control**: Funds remain in DAO treasury controlled by governance
- **Custom Liquidity Locking**: Using our own bonding curve mechanism rather than external platforms

## Bonding Curve Implementation Details

### Technical Parameters

- Initial virtual SOL reserves: 30,000,000,000 lamports
- Initial virtual token reserves: 100,000,000,000,000 (adjusted for decimals)
- Real token reserves: 50,000,000,000,000 (50% of supply available for sale)
- Token decimals: 6

### Buy Operation

1. User sends SOL to bonding curve
2. 20% is allocated to treasury
3. Virtual SOL reserves increase by 80% of the SOL amount
4. Real SOL reserves increase by 100% of the SOL amount
5. Token price is calculated based on the virtual reserves formula
6. Tokens sent to user based on the calculated price

### Sell Operation

1. User sends tokens to bonding curve
2. System calculates SOL return based on constant product formula
3. Treasury allocation is reduced proportionally (20% of SOL returned)
4. Real token reserves increase by 100% of tokens sent
5. Virtual token reserves increase by 100% of tokens sent
6. Virtual SOL reserves decrease by the amount returned to user
7. Real SOL reserves decrease by the amount returned to user

### Migration Triggers

- Primary: SOL fundraising target reached (configurable)
- Secondary: Target market cap reached (configurable)
- Alternative: Fundraising time window expired (configurable, default 7 days)

### Migration Process

1. Calculate final bonding curve price
2. Allocate treasury portion (20% of total SOL raised)
3. Process remaining assets:
   - Move liquidity to Raydium AMM pool at the final price
   - Deploy custom liquidity locking mechanism
4. Burn all unsold tokens
5. Lock liquidity for predetermined period

## CLI Command Examples

```bash
# Configure bonding curve with updated parameters
assetCLI token setup-curve --type constant-product \
  --initial-virtual-sol 30000000000 \
  --initial-virtual-tokens 100000000000000 \
  --real-token-reserves 50000000000000 \
  --treasury-allocation 20 \
  --always-liquid true

# Check current bonding curve state
assetCLI token curve-status

# Set up migration parameters
assetCLI token setup-migration --treasury-pct 20 --liquidity-lock-duration 180d

# Force migration (if conditions met)
assetCLI token execute-migration --burn-unsold true --lock-liquidity true
```

## Technical Considerations

### Mathematical Integrity

- The constant product formula must be preserved throughout all operations
- Virtual reserves track the mathematically relevant amounts for pricing
- Real reserves track the actual asset holdings

### Security Measures

- Circuit breakers to pause trading if price moves >10% in 5 minutes
- Invariant checks ensuring virtual/real reserves remain consistent
- Treasury allocation tracking with underflow protection

### Advanced Curve Options

- Future support for sigmoid curve with linear price floor:
  `price = max(a / (1 + e^(-k * (supply - m))) + b, c + d * supply)`
- Configurable parameters via governance proposals
- Advanced price discovery mechanisms

## 3. Governance Structure

### Token Roles

- **Community Tokens**: Main governance tokens with voting power
- **Council Tokens**: Special role tokens for oversight (optional)

### Proposal Tiers

1. **Micro Proposals** (lesser of 1% treasury or $10K USD equivalent)

   - Only community token vote required
   - Config authority auto-execution
   - Maximum 5 micro proposals per week

2. **Standard Proposals** (lesser of 10% treasury or $100K USD equivalent)

   - Community vote + config authority approval
   - Reduced multisig requirement (dynamic: 2/5 for <$1M treasury, 3/5 for $1-5M)

3. **Major Proposals** (>10% treasury or >$100K USD equivalent)
   - Community vote + full multisig requirement (4/5)
   - No config authority override
   - 72-hour timelock with emergency veto capability

### Config Authority Implementation

- Config authority PDA derived from DAO address
- Authority checks proposal size and vote outcome
- For micro/standard proposals, executes transaction directly
- Removes need for manual signatures on smaller proposals
- Major proposals still require full multisig authorization

## 4. User Flow

### Bonding Curve Phase (Fair Launch)

1. Creator initializes a "Guardian DAO" with configurable parameters
2. Deploys AI agent immediately, providing Twitter/X username during setup
3. Configures bonding curve parameters and target market cap
4. Optionally creates invite links for "Party Round" participants
5. Launches token sale on bonding curve
6. Users can buy AND SELL tokens at algorithmically determined price
7. All funds flow to DAO treasury
8. Creator and team members govern the AI agent during this phase

### Migration Phase

1. When target market cap reached OR fundraise window expires:
   - 50% of liquidity migrates to Raydium
   - 50% of liquidity to DAO treasury
   - Both pools are locked for predetermined period
2. Guardian DAO converts to full community governance

### DAO Governance Phase

1. When threshold reached, migrate to Raydium liquidity pool
2. Convert Guardian DAO to full community governance
3. **Transfer AI agent governance from creators to community token holders**
4. Token holders can create/vote on proposals
5. Config authority handles execution for smaller proposals
6. Larger proposals require manual multisig signatures

### AI Agent Interaction

1. Governance votes to deploy AI agents
2. Parameters stored on-chain, execution happens off-chain
3. Treasury pays for AI services based on proposal approvals
4. Agents submit proof of work for verification

## 5. Implementation Phases

### Phase 1: Infrastructure (1-2 months)

- Reorganize service code structure
- Implement linear bonding curve contract first, then sigmoid
- Create Guardian DAO setup
- **Build initial AI agent deployment system with basic verification**
- Implement circuit breakers and safety controls

## 6. CLI Command Examples

```bash
# Create Guardian DAO
assetCLI guardian-dao init --name "AI_DAO" --members <PUBKEY1,PUBKEY2> --threshold 2

# Deploy AI agent immediately
assetCLI agent deploy --name "TradingBot" --params "frequency=2,max-trade=5" --executor <PUBKEY> --social-handle "@AIBot_Trading" --verification basic

# Configure bonding curve (simplified linear option)
assetCLI token setup-curve --type linear --params "m=0.0000001,b=0.1" --circuit-breaker true --always-liquid true

# Configure fundraising target (DAOS.FUN style)
assetCLI token setup-fundraise --target 1000 --burn-unsold true --min-raise 100

# Configure fair launch
assetCLI token setup-launch --target-cap 10000000 --fundraise-window 7d

# Create party round invite
assetCLI token create-invite --amount-cap 100000 --expires 48h --max-participants 50

# Launch token sale with dry-run simulation
assetCLI token launch-sale --min-purchase 0.1 --max-purchase 100 --agent-handle "@AIBot_Trading" --simulate

# Check fundraising status
assetCLI token fundraise-status

# Force fundraise completion (if conditions met)
assetCLI token complete-fundraise --burn-unsold true --timelock 48h

# Configure dual pool migration
assetCLI token setup-migration --raydium-pct 50 --daosfun-pct 50 --lock-duration 180d

# Check migration status
assetCLI token migration-status

# Force migrate (with enhanced security)
assetCLI token force-migration --timelock 7d --council-approval 3 --community-approval 30

# Transfer AI governance to community
assetCLI agent transfer-governance --agent-id <AGENT_ID> --to-community

# Create proposal with tier
assetCLI proposal create --type treasury-spending --amount 50 --recipient <PUBKEY> --tier micro

# Update AI agent parameters
assetCLI agent update --name "TradingBot" --params "frequency=4,max-trade=10" --tier standard
```

## 7. Technical Considerations

### On-chain Storage Optimization

- Use compact data structures to reduce storage costs
- Implement off-chain metadata storage when appropriate
- Carefully manage account size growth

### Security Measures

- Implement timelock delays for major proposals
- Rate limiting for proposal creation
- Multi-stage approval for high-value transactions
- Regular security audits

### AI Agent Verification

- **MVP Verification**: Signed API callbacks from agent execution
- **Advanced Verification**: ZK-proofs for computational integrity
- **Economic Security**: Require executors to stake tokens as collateral
- **Delegated Monitoring**: Community-elected watchers verify AI outputs

### Multisig Integration

- **Dynamic Thresholds**: Scale based on treasury size
  - <$1M: 2/5 signatures
  - $1M-$5M: 3/5 signatures
  - > $5M: 4/5 signatures
- For micro/standard proposals: Config authority acts as proxy
- For major proposals: Full multisig requirement
- Emergency override capability with supermajority vote (90%+)

### Future Extensions

- Token staking and reward distribution
- Quadratic voting implementation
- NFT-gated governance areas
- Cross-chain asset management
