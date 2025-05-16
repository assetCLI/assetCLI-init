<!-- # Fixing LP Lock, Harvest, and Swap After Mint Ordering Changes

The problem is that after implementing proper mint ordering for Raydium pool creation, we also need to update the other methods that interact with the pool. Let's fix all three functions:

## 1. Lock LP Tokens Function

```typescript
async lockLpTokens(
  mint: PublicKey,
  feeNftMint: Keypair
): Promise<ServiceResponse<string>> {
  try {
    const user = this.provider.wallet.publicKey;
    const baseMint = new PublicKey(curveResult.data.baseMint);
    const poolState = this.findPoolStatePda(mint, baseMint);
    const lpMint = this.findLpMintPda(poolState);

    // Get ordered mints
    const [token0Mint, token1Mint] = this.getOrderedMints(baseMint, mint);

    // Get ordered vaults
    const token0Vault = this.findTokenVaultPda(poolState, token0Mint);
    const token1Vault = this.findTokenVaultPda(poolState, token1Mint);

    // User's LP token account
    const userLpTokenAccount = this.getAssociatedTokenAddress(lpMint, user);

    // NFT related accounts
    const feeNftAccount = this.getAssociatedTokenAddress(feeNftMint.publicKey, user);
    const lockedLpVault = this.getAssociatedTokenAddress(
      lpMint,
      new PublicKey(LOCK_CPMM_AUTHORITY_ID)
    );

    const lockedLiquidity = PublicKey.findProgramAddressSync(
      [Buffer.from("locked_liquidity"), feeNftMint.publicKey.toBuffer()],
      new PublicKey(LOCK_CPMM_PROGRAM_ID)
    )[0];

    const feeNftMetadataAddress = this.findMetadataPda(feeNftMint.publicKey);

    const modifyComputeUnits = web3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_000_000,
    });

    const ix = await this.program.methods
      .lockCpmmLiquidity()
      .accountsPartial({
        lockCpmmProgram: new PublicKey(LOCK_CPMM_PROGRAM_ID),
        feeNftAcc: feeNftAccount,
        lockedLpVault: lockedLpVault,
        ammConfig: new PublicKey(AMM_CONFIG_ID),
        authority: new PublicKey(LOCK_CPMM_AUTHORITY_ID),
        feeNftMint: feeNftMint.publicKey,
        poolState: poolState,
        lockedLiquidity: lockedLiquidity,
        lpMint: lpMint,
        token0Vault: token0Vault,
        token1Vault: token1Vault,
        metadata: feeNftMetadataAddress,
        metadataProgram: new PublicKey(METADATA_PROGRAM_ID),
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        baseMint: baseMint,
        tokenMint: mint,
        cpSwapProgram: new PublicKey(CPMM_PROGRAM_ID),
        user: user,
        userLpTokenAccount: userLpTokenAccount,
      })
      .preInstructions([modifyComputeUnits])
      .signers([feeNftMint])
      .rpc();

    return { success: true, data: ix };
  } catch (error: any) {
    return {
      success: false,
      error: { message: `Lock LP tokens failed: ${error}`, details: error },
    };
  }
}
```

## 2. Harvest Locked Liquidity Function

```typescript
async harvestLockedLiquidity(
  mint: PublicKey,
  feeNftMint: PublicKey
): Promise<ServiceResponse<string>> {
  try {
    const creator = this.provider.wallet.publicKey;
    const curveResult = await this.getBondingCurve(mint);
    if (!curveResult.success || !curveResult.data) {
      return {
        success: false,
        error: { message: "Failed to get bonding curve data", details: null },
      };
    }

    const baseMint = new PublicKey(curveResult.data.baseMint);
    const poolState = this.findPoolStatePda(mint, baseMint);
    const lpMint = this.findLpMintPda(poolState);
    const authority = this.findCpmmAuthorityPda();

    // Get ordered mints
    const [token0Mint, token1Mint] = this.getOrderedMints(baseMint, mint);

    // Get token vaults
    const token0Vault = this.findTokenVaultPda(poolState, token0Mint);
    const token1Vault = this.findTokenVaultPda(poolState, token1Mint);

    // Correctly determine which vault is for which token
    let tokenVault, baseVault, token0Program, token1Program;
    if (baseMint.equals(token0Mint)) {
      baseVault = token0Vault;
      tokenVault = token1Vault;
      token0Program = TOKEN_PROGRAM_ID;
      token1Program = TOKEN_PROGRAM_ID; // Or TOKEN_2022_PROGRAM_ID if needed
    } else {
      baseVault = token1Vault;
      tokenVault = token0Vault;
      token0Program = TOKEN_PROGRAM_ID; // Or TOKEN_2022_PROGRAM_ID if needed
      token1Program = TOKEN_PROGRAM_ID;
    }

    // User token accounts
    const userTokenAccount = this.getAssociatedTokenAddress(mint, creator);
    const userBaseTokenAccount = this.getAssociatedTokenAddress(baseMint, creator);
    const creatorNftMintAccount = this.getAssociatedTokenAddress(feeNftMint, creator);

    // Locked liquidity PDA
    const lockedLiquidity = PublicKey.findProgramAddressSync(
      [Buffer.from("locked_liquidity"), feeNftMint.toBuffer()],
      new PublicKey(LOCK_CPMM_PROGRAM_ID)
    )[0];

    const lockedLpVault = this.getAssociatedTokenAddress(
      lpMint,
      new PublicKey(LOCK_CPMM_AUTHORITY_ID)
    );

    const tx = await this.program.methods
      .harvestLockedCpmmLiquidity()
      .accountsPartial({
        lockCpmmProgram: new PublicKey(LOCK_CPMM_PROGRAM_ID),
        ammConfig: new PublicKey(AMM_CONFIG_ID),
        creator: creator,
        authority: new PublicKey(LOCK_CPMM_AUTHORITY_ID),
        feeNftAccount: creatorNftMintAccount,
        lockedLiquidity: lockedLiquidity,
        cpSwapProgram: new PublicKey(CPMM_PROGRAM_ID),
        cpAuthority: authority,
        poolState,
        lpMint,
        baseVault: userBaseTokenAccount,
        tokenVault: userTokenAccount,
        token0Vault,
        token1Vault,
        baseMint,
        tokenMint: mint,
        lockedLpVault,
        systemProgram: web3.SystemProgram.programId,
        memoProgram: new PublicKey(MEMO_PROGRAM),
        token0Program,
        token1Program,
      })
      .rpc();

    return { success: true, data: tx };
  } catch (error: any) {
    return {
      success: false,
      error: { message: `Harvest locked liquidity failed: ${error}`, details: error },
    };
  }
}
```

## 3. Raydium Swap Function

```typescript
async raydiumSwap(
  mint: PublicKey,
  amountIn: BN,
  slippage: BN = new BN(500)
): Promise<ServiceResponse<string>> {
  try {
    const user = this.provider.wallet.publicKey;
    const curveResult = await this.getBondingCurve(mint);
    if (!curveResult.success || !curveResult.data) {
      return {
        success: false,
        error: { message: "Failed to get bonding curve data", details: null },
      };
    }

    const baseMint = new PublicKey(curveResult.data.baseMint);
    const poolState = this.findPoolStatePda(mint, baseMint);
    const authority = this.findCpmmAuthorityPda();
    const observationState = this.findObservationStatePda(poolState);

    // User token accounts
    const userTokenAccount = this.getAssociatedTokenAddress(mint, user);
    const userBaseTokenAccount = this.getAssociatedTokenAddress(baseMint, user);

    // We're assuming the input is base and output is token
    const inputTokenAccount = userBaseTokenAccount;
    const outputTokenAccount = userTokenAccount;
    const inputTokenMint = baseMint;
    const outputTokenMint = mint;

    // Get ordered vaults
    const [token0Mint, token1Mint] = this.getOrderedMints(baseMint, mint);
    const token0Vault = this.findTokenVaultPda(poolState, token0Mint);
    const token1Vault = this.findTokenVaultPda(poolState, token1Mint);

    // Determine input and output vaults based on which mint is which
    let inputVault, outputVault, inputTokenProgram, outputTokenProgram;
    if (inputTokenMint.equals(token0Mint)) {
      inputVault = token0Vault;
      outputVault = token1Vault;
      inputTokenProgram = TOKEN_PROGRAM_ID;
      outputTokenProgram = TOKEN_PROGRAM_ID; // Or TOKEN_2022_PROGRAM_ID if needed
    } else {
      inputVault = token1Vault;
      outputVault = token0Vault;
      inputTokenProgram = TOKEN_PROGRAM_ID;
      outputTokenProgram = TOKEN_PROGRAM_ID; // Or TOKEN_2022_PROGRAM_ID if needed
    }

    const tx = new web3.Transaction();
    const swapIx = await this.program.methods
      .raydiumSwap(amountIn, slippage)
      .accountsPartial({
        cpSwapProgram: new PublicKey(CPMM_PROGRAM_ID),
        user,
        authority,
        ammConfig: new PublicKey(AMM_CONFIG_ID),
        poolState,
        inputTokenAccount,
        outputTokenAccount,
        inputVault,
        outputVault,
        inputTokenProgram,
        outputTokenProgram,
        inputTokenMint,
        outputTokenMint,
        observationState,
      })
      .instruction();

    tx.add(swapIx);
    const signature = await this.provider.sendAndConfirm(tx);

    return { success: true, data: signature };
  } catch (error: any) {
    return {
      success: false,
      error: { message: `Raydium swap failed: ${error}`, details: error },
    };
  }
}
```

## Key Changes Made:

1. **For all methods**:
   - Used `getOrderedMints` to get deterministic ordering of mints
   - Used proper PDAs for vaults based on this mint ordering

2. **For harvest method**:
   - Added logic to correctly map token0/token1 to base/token
   - Set appropriate token programs based on mint ordering

3. **For swap method**:
   - Added logic to determine which vault is input and which is output
   - Assigned appropriate token programs based on order

These changes ensure that all methods that interact with the Raydium pool properly respect the deterministic ordering of tokens required by the Raydium protocol. -->
