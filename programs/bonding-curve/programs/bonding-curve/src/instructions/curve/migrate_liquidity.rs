// use anchor_lang::prelude::*;
// use anchor_spl::{
//     token_2022::spl_token_2022::instruction::AuthorityType,
//     token_interface::{
//         Mint,
//         TokenAccount,
//         TokenInterface,
//         freeze_account,
//         FreezeAccount,
//         ThawAccount,
//         thaw_account,
//         set_authority,
//         SetAuthority,
//     },
// };
// use crate::{ BondingCurve, Global };
// pub struct BondingCurveLockerCtx<'info> {
//     pub bonding_curve_bump: u8,
//     pub mint: Box<InterfaceAccount<'info, Mint>>,
//     pub bonding_curve: Box<Account<'info, BondingCurve>>,
//     pub bonding_curve_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
//     pub token_program: Interface<'info, TokenInterface>,
//     pub global: Box<Account<'info, Global>>,
// }

// impl BondingCurveLockerCtx<'_> {
//     fn get_signer<'a>(&self) -> [&[u8]; 3] {
//         let signer: [&[u8]; 3] = BondingCurve::get_signer(
//             &self.bonding_curve_bump,
//             self.mint.to_account_info().key
//         );
//         signer
//     }
//     pub fn lock_ata<'a>(&self) -> Result<()> {
//         let signer = self.get_signer();
//         let signer_seeds: &[&[&[u8]]; 1] = &[&signer[..]];

//         let accs = FreezeAccount {
//             account: self.bonding_curve_token_account.to_account_info(),
//             mint: self.mint.to_account_info(),
//             authority: self.bonding_curve.to_account_info(),
//         };
//         freeze_account(
//             CpiContext::new_with_signer(self.token_program.to_account_info(), accs, signer_seeds)
//         )?;
//         msg!("BondingCurveLockerCtx::lock_ata complete");

//         Ok(())
//     }
//     pub fn unlock_ata<'a>(&self) -> Result<()> {
//         let signer = self.get_signer();
//         let signer_seeds: &[&[&[u8]]; 1] = &[&signer[..]];

//         let accs = ThawAccount {
//             account: self.bonding_curve_token_account.to_account_info(),
//             mint: self.mint.to_account_info(),
//             authority: self.bonding_curve.to_account_info(),
//         };
//         thaw_account(
//             CpiContext::new_with_signer(self.token_program.to_account_info(), accs, signer_seeds)
//         )?;
//         msg!("BondingCurveLockerCtx::unlock_ata complete");

//         Ok(())
//     }

//     pub fn revoke_mint_authority(&self) -> Result<()> {
//         let mint_info = self.mint.to_account_info();
//         let mint_authority_info = self.bonding_curve.to_account_info();
//         let signer = self.get_signer();
//         let signer_seeds: &[&[&[u8]]; 1] = &[&signer[..]];

//         //remove mint_authority
//         set_authority(
//             CpiContext::new_with_signer(
//                 self.token_program.to_account_info(),
//                 SetAuthority {
//                     current_authority: mint_authority_info.clone(),
//                     account_or_mint: mint_info.clone(),
//                 },
//                 signer_seeds
//             ),
//             AuthorityType::MintTokens,
//             None
//         )?;
//         msg!("CreateBondingCurve::revoke_mint_authority: done");

//         Ok(())
//     }

//     pub fn revoke_freeze_authority(&self) -> Result<()> {
//         let mint_info = self.mint.to_account_info();
//         let mint_authority_info = self.bonding_curve.to_account_info();
//         let signer = self.get_signer();
//         let signer_seeds: &[&[&[u8]]; 1] = &[&signer[..]];

//         // revoke freeze authority
//         set_authority(
//             CpiContext::new_with_signer(
//                 self.token_program.to_account_info(),
//                 SetAuthority {
//                     current_authority: mint_authority_info.clone(),
//                     account_or_mint: mint_info.clone(),
//                 },
//                 signer_seeds
//             ),
//             AuthorityType::FreezeAccount,
//             None
//         )?;

//         msg!("CreateBondingCurve::revoke_freeze_authority: done");

//         Ok(())
//     }

//     pub fn process(&mut self) -> Result<()> {
//         // Calculate final bonding curve price
//         let final_price = self.calculate_current_token_price()?;

//         // Allocate reserves for AMM to maintain price
//         let (token_amount, sol_amount) = self.calculate_amm_initial_liquidity(final_price)?;

//         // Burn remaining tokens not needed for liquidity
//         // This creates scarcity to compensate for treasury SOL being removed
//         let tokens_to_burn = self.bonding_curve.real_token_reserves
//             .checked_sub(token_amount)
//             .ok_or(ContractError::ArithmeticError)?;

//         // Transfer 20% of SOL to treasury
//         let treasury_amount = (self.bonding_curve.real_sol_reserves as u128)
//             .checked_mul(2000)
//             .and_then(|amt| amt.checked_div(10000))
//             .and_then(|amt| u64::try_from(amt).ok())
//             .ok_or(ContractError::ArithmeticError)?;

//         // Create AMM pool with remaining SOL and calculated token amount

//         // ...existing code...
//     }
// }

// pub trait IntoBondingCurveLockerCtx<'info> {
//     fn into_bonding_curve_locker_ctx(&self, bonding_curve_bump: u8) -> BondingCurveLockerCtx<'info>;
// }

// use crate::{
//     errors::ContractError,
//     BondingCurve,
//     Global,
//     BondingCurveLockerCtx,
//     IntoBondingCurveLockerCtx,
//     TargetReached,
//     LiquidityMigrated,
// };

// #[derive(Accounts)]
// pub struct MigrateLiquidity<'info> {
//     #[account(mut)]
//     pub authority: Signer<'info>,

//     #[account(seeds = [Global::SEED_PREFIX.as_bytes()], bump)]
//     pub global: Box<Account<'info, Global>>,

//     #[account(
//         mut,
//         constraint = bonding_curve.complete == true @ ContractError::BondingCurveNotComplete,
//         seeds = [BondingCurve::SEED_PREFIX.as_bytes(), bonding_curve.mint.as_ref()],
//         bump = bonding_curve.bump
//     )]
//     pub bonding_curve: Box<Account<'info, BondingCurve>>,

//     #[account(mut)]
//     // CHECK: Treasury account, will be validated in code
//     pub treasury: AccountInfo<'info>,

//     #[account(
//         mut,
//         constraint = mint.key() == bonding_curve.mint @ ContractError::NotBondingCurveMint,
//     )]
//     pub mint: Box<InterfaceAccount<'info, Mint>>,

//     #[account(
//         mut,
//         associated_token::mint = mint,
//         associated_token::authority = bonding_curve,
//     )]
//     pub bonding_curve_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

//     pub token_program: Interface<'info, TokenInterface>,
//     pub system_program: Program<'info, System>,
// }

// impl<'info> IntoBondingCurveLockerCtx<'info> for MigrateLiquidity<'info> {
//     fn into_bonding_curve_locker_ctx(
//         &self,
//         bonding_curve_bump: u8
//     ) -> BondingCurveLockerCtx<'info> {
//         BondingCurveLockerCtx {
//             bonding_curve_bump,
//             mint: self.mint.clone(),
//             bonding_curve: self.bonding_curve.clone(),
//             bonding_curve_token_account: self.bonding_curve_token_account.clone(),
//             token_program: self.token_program.clone(),
//             global: self.global.clone(),
//         }
//     }
// }

// impl<'info> MigrateLiquidity<'info> {
//     pub fn validate(&self) -> Result<()> {
//         // Check the authority is valid (global authority or bonding curve creator)
//         require!(
//             *self.authority.key == self.global.global_authority ||
//                 *self.authority.key == self.bonding_curve.creator,
//             ContractError::InvalidMigrationAuthority
//         );

//         // Check that the treasury matches the realm pubkey in bonding curve
//         require!(
//             *self.treasury.key == self.bonding_curve.realm_pubkey,
//             ContractError::InvalidRealmAccount
//         );

//         Ok(())
//     }

//     pub fn process(&mut self) -> Result<()> {
//         self.validate()?;

//         let clock = Clock::get()?;

//         // Calculate the treasury amount from the tracked allocation
//         let treasury_amount = self.bonding_curve.treasury_allocation;

//         // Calculate the amount for Raydium pool (50% of remaining)
//         let remaining_sol = self.bonding_curve.real_sol_reserves
//             .checked_sub(treasury_amount)
//             .ok_or(ContractError::ArithmeticError)?;

//         let raydium_sol_amount = remaining_sol / 2;
//         let daos_pool_sol_amount = remaining_sol - raydium_sol_amount;

//         // For the actual migration, we'd calculate proper token amounts,
//         // interact with Raydium's SDK, etc.
//         // This is simplified for demonstration purposes.

//         // Transfer treasury allocation
//         let signer = BondingCurve::get_signer(&self.bonding_curve.bump, &self.bonding_curve.mint);
//         let signer_seeds = &[&signer[..]];

//         let treasury_ix = solana_program::system_instruction::transfer(
//             &self.bonding_curve.key(),
//             &self.treasury.key(),
//             treasury_amount
//         );

//         solana_program::program::invoke_signed(
//             &treasury_ix,
//             &[
//                 self.bonding_curve.to_account_info(),
//                 self.treasury.to_account_info(),
//                 self.system_program.to_account_info(),
//             ],
//             signer_seeds
//         )?;

//         msg!("Transferred {} lamports to treasury", treasury_amount);

//         // In a real implementation, we would:
//         // 1. Create Raydium pool
//         // 2. Create DAOS.FUN pool
//         // 3. Burn any unused tokens

//         // Emit events
//         emit!(TargetReached {
//             bonding_curve: self.bonding_curve.key(),
//             final_sol_raised: self.bonding_curve.real_sol_reserves,
//             timestamp: clock.unix_timestamp,
//         });

//         emit!(LiquidityMigrated {
//             bonding_curve: self.bonding_curve.key(),
//             raydium_pool: Pubkey::default(), // Would be actual pool in real implementation
//             daos_fun_pool: Pubkey::default(), // Would be actual pool in real implementation
//             sol_amount: remaining_sol,
//             token_amount: self.bonding_curve.real_token_reserves,
//             timestamp: clock.unix_timestamp,
//         });

//         Ok(())
//     }
// }

// This file is a placeholder for future migration functionality.
// Implementation will follow the tokenomics model with:
// - 80% of SOL to DAO treasury
// - 20% split for Raydium and continued liquidity
// - LP token generation and locking
// - Token allocation (20% to DAO, 10% burn, 20% locked)
