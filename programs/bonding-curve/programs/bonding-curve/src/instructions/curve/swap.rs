use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{ Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked },
};

use crate::{
    errors::ContractError,
    BondingCurve,
    BuyResult,
    Global,
    Proposal,
    SellResult,
    TokensPurchased,
    TokensSold,
};

#[derive(anchor_lang::AnchorSerialize, anchor_lang::AnchorDeserialize)]
pub struct SwapParams {
    pub base_in: bool,
    pub amount: u64,
    pub min_out_amount: u64,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds=[Global::SEED_PREFIX.as_bytes()],
        constraint=global.initialized == true @ ContractError::NotInitialized,
        bump = global.bump
    )]
    pub global: Box<Account<'info, Global>>,
    #[account(mut)]
    /// CHECK: fee receiver asserted in validation function
    pub fee_receiver: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = base_mint,
        associated_token::authority = fee_receiver
    )]
    pub fee_receiver_base_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        seeds = [BondingCurve::SEED_PREFIX.as_bytes(), token_mint.key().as_ref()],
        constraint = bonding_curve.token_mint == token_mint.key() @ ContractError::NotBondingCurveMint,
        bump = bonding_curve.bump
    )]
    pub bonding_curve: Box<Account<'info, BondingCurve>>,
    #[account(
        mut,
        seeds = [BondingCurve::VAULT_PREFIX.as_bytes(), token_mint.key().as_ref()],
        bump = bonding_curve.vault_bump,
    )]
    pub bonding_curve_vault: SystemAccount<'info>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority= bonding_curve_vault,
        constraint = bonding_curve.token_mint == token_mint.key() @ ContractError::NotBondingCurveMint,
    )]
    pub bonding_curve_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = base_mint,
        associated_token::authority = bonding_curve_vault
    )]
    pub bonding_curve_base_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint,
        associated_token::authority = user
    )]
    pub user_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = user
    )]
    pub user_base_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(seeds = [Proposal::SEED_PREFIX.as_bytes(), token_mint.key().as_ref()], bump)]
    pub proposal: Box<Account<'info, Proposal>>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub clock: Sysvar<'info, Clock>,
}

impl<'info> Swap<'info> {
    pub fn validate(&self, params: &SwapParams) -> Result<()> {
        let SwapParams { base_in: _, amount, min_out_amount: _ } = params;
        let clock = Clock::get()?;
        require!(self.bonding_curve.is_started(&clock), ContractError::CurveNotStarted);
        require!(*amount > 0, ContractError::MinSwap);
        require!(
            self.fee_receiver.key() == self.global.fee_receiver.key(),
            ContractError::InvalidFeeReceiver
        );
        Ok(())
    }
    pub fn process(&mut self, params: SwapParams) -> Result<()> {
        let clock = Clock::get()?;
        let slot = clock.unix_timestamp;
        require!(self.bonding_curve.is_started(&clock), ContractError::CurveNotStarted);
        require!(!self.bonding_curve.complete, ContractError::BondingCurveComplete);
        let SwapParams { base_in, amount, min_out_amount } = params;
        let bonding_curve = self.bonding_curve.clone();
        let base_amount: u64;
        let token_amount: u64;
        let fee_amount: u64;

        if base_in {
            // Sell token for base token
            require!(
                self.user_token_account.amount >= amount,
                ContractError::InsufficientUserTokens
            );
            let sell_result = match self.bonding_curve.apply_sell(amount, slot) {
                Some(result) => result,
                None => {
                    return Err(ContractError::SellFailed.into());
                }
            };
            // Use fee_amount from SellResult
            fee_amount = sell_result.fee_amount;
            base_amount = sell_result.base_amount;
            token_amount = sell_result.token_amount;
            self.complete_sell(sell_result.clone(), min_out_amount, fee_amount)?;
            emit!(TokensSold {
                bonding_curve: self.bonding_curve.key(),
                seller: self.user.key(),
                token_amount,
                base_amount,
                price_per_token: sell_result.price_per_token,
                timestamp: clock.unix_timestamp,
            });
        } else {
            // Buy token with base token
            // User sends net base, so we must reverse-calculate gross for fee
            // Let net = gross - fee(gross), solve for gross
            // gross = net * 10000 / (10000 - fee_bps)
            let fee_bps = bonding_curve.get_fee_bps(slot);
            let gross_base = amount
                .checked_mul(10_000)
                .ok_or(ProgramError::ArithmeticOverflow)?
                .checked_div(10_000 - fee_bps)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            // Use gross_base for buy, get fee from BuyResult
            let buy_result = self.bonding_curve
                .apply_buy(gross_base, slot)
                .ok_or(ContractError::BuyFailed)?;
            fee_amount = buy_result.fee_amount;
            base_amount = amount;
            token_amount = buy_result.token_amount;
            self.complete_buy(buy_result.clone(), min_out_amount, fee_amount)?;
            emit!(TokensPurchased {
                bonding_curve: self.bonding_curve.key(),
                buyer: self.user.key(),
                base_amount,
                token_amount,
                price_per_token: buy_result.price_per_token,
                timestamp: clock.unix_timestamp,
            });
        }
        Ok(())
    }

    fn complete_buy(
        &mut self,
        buy_result: BuyResult,
        min_out_amount: u64,
        fee_amount: u64
    ) -> Result<()> {
        require!(buy_result.token_amount >= min_out_amount, ContractError::SlippageExceeded);
        // Transfer net base token from user to vault
        let user_to_vault = TransferChecked {
            from: self.user_base_account.to_account_info(),
            authority: self.user.to_account_info(),
            to: self.bonding_curve_base_account.to_account_info(),
            mint: self.base_mint.to_account_info(),
        };
        transfer_checked(
            CpiContext::new(self.token_program.to_account_info(), user_to_vault),
            buy_result.base_amount, // this is the base_amount minus fee
            self.base_mint.decimals
        )?;
        // Transfer fee to fee receiver
        let vault_to_fee = TransferChecked {
            from: self.bonding_curve_base_account.to_account_info(),
            authority: self.bonding_curve_vault.to_account_info(),
            to: self.fee_receiver_base_account.to_account_info(),
            mint: self.base_mint.to_account_info(),
        };

        let signer = self.bonding_curve.get_vault_seeds();
        let signer_seeds = &[&signer[..]];
        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                vault_to_fee,
                signer_seeds
            ),
            fee_amount,
            self.base_mint.decimals
        )?;
        // Transfer project tokens to user
        let cpi_accounts = TransferChecked {
            from: self.bonding_curve_token_account.to_account_info(),
            authority: self.bonding_curve_vault.to_account_info(),
            to: self.user_token_account.to_account_info(),
            mint: self.token_mint.to_account_info(),
        };
        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds
            ),
            buy_result.token_amount,
            self.token_mint.decimals
        )?;
        self.bonding_curve.real_base_reserves =
            self.bonding_curve.real_base_reserves.saturating_sub(fee_amount);
        Ok(())
    }

    fn complete_sell(
        &mut self,
        sell_result: SellResult,
        min_out_amount: u64,
        fee_amount: u64
    ) -> Result<()> {
        require!(sell_result.base_amount >= min_out_amount, ContractError::SlippageExceeded);
        // Send project tokens from user
        let cpi_accounts = TransferChecked {
            from: self.user_token_account.to_account_info(),
            authority: self.user.to_account_info(),
            to: self.bonding_curve_token_account.to_account_info(),
            mint: self.token_mint.to_account_info(),
        };
        transfer_checked(
            CpiContext::new(self.token_program.to_account_info(), cpi_accounts),
            sell_result.token_amount,
            self.token_mint.decimals
        )?;
        // Transfer base token from vault to user (minus fee)
        let vault_to_user = TransferChecked {
            from: self.bonding_curve_base_account.to_account_info(),
            authority: self.bonding_curve_vault.to_account_info(),
            to: self.user_base_account.to_account_info(),
            mint: self.base_mint.to_account_info(),
        };
        let signer = self.bonding_curve.get_vault_seeds();
        let signer_seeds = &[&signer[..]];
        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                vault_to_user,
                signer_seeds
            ),
            sell_result.base_amount, // this is the base_amount minus fee
            self.base_mint.decimals
        )?;
        // Transfer fee to fee receiver
        let vault_to_fee = TransferChecked {
            from: self.bonding_curve_base_account.to_account_info(),
            authority: self.bonding_curve_vault.to_account_info(),
            to: self.fee_receiver_base_account.to_account_info(),
            mint: self.base_mint.to_account_info(),
        };
        transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                vault_to_fee,
                signer_seeds
            ),
            fee_amount,
            self.base_mint.decimals
        )?;
        self.bonding_curve.real_base_reserves =
            self.bonding_curve.real_base_reserves.saturating_sub(fee_amount);
        Ok(())
    }
}
