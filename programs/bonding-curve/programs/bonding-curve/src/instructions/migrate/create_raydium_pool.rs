use anchor_lang::{ prelude::*, solana_program::{ self, system_instruction } };
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{ set_authority, spl_token::{ self, instruction::AuthorityType }, SetAuthority },
    token_interface::{ Mint, TokenAccount, TokenInterface },
};
use raydium_cpmm_cpi::{
    cpi,
    program::RaydiumCpmm,
    states::{ AmmConfig, OBSERVATION_SEED, POOL_LP_MINT_SEED, POOL_SEED, POOL_VAULT_SEED },
};
use crate::{ errors::ContractError, BondingCurve, Global, Proposal, WSOL_ID };

#[derive(Accounts)]
pub struct CreateRaydiumPool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        seeds=[Global::SEED_PREFIX.as_bytes()],
        constraint=global.initialized == true @ ContractError::NotInitialized,
        bump = global.bump
    )]
    pub global: Box<Account<'info, Global>>,
    #[account(mut)]
    /// CHECK: fee receiver asserted in validation function
    pub fee_receiver: UncheckedAccount<'info>,
    #[account(mut)]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        address = WSOL_ID,
        constraint = base_mint.key() < token_mint.key(),
    )]
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        seeds=[BondingCurve::SEED_PREFIX.as_bytes(), token_mint.key().as_ref()],
        constraint = bonding_curve.mint == token_mint.key() @ ContractError::NotBondingCurveMint,
        bump = bonding_curve.bump
    )]
    pub bonding_curve: Box<Account<'info, BondingCurve>>,
    #[account(
        mut,
        seeds=[BondingCurve::VAULT_PREFIX.as_bytes(), token_mint.key().as_ref()],
        bump=bonding_curve.vault_bump,
    )]
    pub bonding_curve_vault: SystemAccount<'info>,
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority= bonding_curve_vault,
        constraint = bonding_curve.mint == token_mint.key() @ ContractError::NotBondingCurveMint,
    )]
    pub bonding_curve_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        associated_token::mint = base_mint,
        associated_token::authority= bonding_curve_vault,
        payer = creator,
        constraint = bonding_curve.mint == token_mint.key() @ ContractError::NotBondingCurveMint,
    )]
    pub bonding_curve_base_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(seeds = [Proposal::SEED_PREFIX.as_bytes(), token_mint.key().as_ref()], bump)]
    pub proposal: Box<Account<'info, Proposal>>,
    /// CHECK: Treasury address, assert in validation function
    #[account(mut,
        constraint = proposal_treasury.key() == proposal.treasury_address @ ContractError::InvalidTreasury
    )]
    pub proposal_treasury: UncheckedAccount<'info>,
    /// CHECK: Proposal authority, assert in validation function
    #[account(mut)]
    pub proposal_authority: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        associated_token::mint = token_mint,
        associated_token::authority = proposal_authority,
        payer = creator
    )]
    pub proposal_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub cp_swap_program: Program<'info, RaydiumCpmm>,
    pub amm_config: Box<Account<'info, AmmConfig>>,
    /// CHECK: pool vault and lp mint authority
    #[account(
        seeds = [raydium_cpmm_cpi::AUTH_SEED.as_bytes()],
        seeds::program = cp_swap_program.key(),
        bump
    )]
    pub authority: UncheckedAccount<'info>,
    /// CHECK: Initialize an account to store the pool state, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_SEED.as_bytes(),
            amm_config.key().as_ref(),
            base_mint.key().as_ref(),
            token_mint.key().as_ref(),
        ],
        seeds::program = cp_swap_program.key(),
        bump,
    )]
    pub pool_state: UncheckedAccount<'info>,
    /// CHECK: pool lp mint, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_LP_MINT_SEED.as_bytes(),
            pool_state.key().as_ref(),
        ],
        seeds::program = cp_swap_program.key(),
        bump,
    )]
    pub lp_mint: UncheckedAccount<'info>,
    /// CHECK: creator lp ATA token account, init by cp-swap
    #[account(mut)]
    pub bonding_curve_lp_token: UncheckedAccount<'info>,
    /// CHECK: Token_0 vault for the pool, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_VAULT_SEED.as_bytes(),
            pool_state.key().as_ref(),
            base_mint.key().as_ref()
        ],
        seeds::program = cp_swap_program.key(),
        bump,
    )]
    pub token_0_vault: UncheckedAccount<'info>,
    /// CHECK: Token_1 vault for the pool, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_VAULT_SEED.as_bytes(),
            pool_state.key().as_ref(),
            token_mint.key().as_ref()
        ],
        seeds::program = cp_swap_program.key(),
        bump,
    )]
    pub token_1_vault: UncheckedAccount<'info>,
    #[account(
        mut,
        address= raydium_cpmm_cpi::create_pool_fee_reveiver::id(),
    )]
    pub create_pool_fee: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: an account to store oracle observations, init by cp-swap
    #[account(
        mut,
        seeds = [
            OBSERVATION_SEED.as_bytes(),
            pool_state.key().as_ref(),
        ],
        seeds::program = cp_swap_program.key(),
        bump,
    )]
    pub observation_state: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_1_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> CreateRaydiumPool<'info> {
    pub fn revoke_mint_authority(&self) -> Result<()> {
        let accounts = SetAuthority {
            account_or_mint: self.token_mint.to_account_info(),
            current_authority: self.bonding_curve.to_account_info(),
        };
        let signer_seeds = self.bonding_curve.get_signer_seeds();
        let signer = &[&signer_seeds[..]];
        let cpi_context = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            accounts,
            signer
        );
        set_authority(cpi_context, AuthorityType::MintTokens, None)?;
        Ok(())
    }

    pub fn wrap_sol_for_cpmm(&mut self, amount_to_wrap: u64) -> Result<()> {
        // Transfer SOL from the bonding curve to the WSOL account
        let transfer_ix = system_instruction::transfer(
            &self.bonding_curve_vault.to_account_info().key,
            &self.bonding_curve_base_token_account.to_account_info().key,
            amount_to_wrap
        );

        // Execute the transfer instruction
        solana_program::program::invoke_signed(
            &transfer_ix,
            &[
                self.bonding_curve_vault.to_account_info(), // from account
                self.bonding_curve_base_token_account.to_account_info(), // to account
                self.system_program.to_account_info(), // system program
            ],
            &[&self.bonding_curve.get_vault_seeds()[..]]
        )?;
        // Create syncNative instruction to sync the native balance
        let sync_native_ix = spl_token::instruction::sync_native(
            &self.token_program.key,
            &self.bonding_curve_base_token_account.to_account_info().key
        )?;

        // Execute the syncNative instruction
        solana_program::program::invoke(
            &sync_native_ix,
            &[
                self.bonding_curve_base_token_account.to_account_info(),
                self.token_program.to_account_info(),
            ]
        )?;
        Ok(())
    }

    pub fn transfer_to_treasury(&mut self, sol_amount: u64, token_amount: u64) -> Result<()> {
        let treasury_address = self.proposal.treasury_address;
        assert_eq!(
            treasury_address,
            self.proposal_treasury.key(),
            "Proposal Authority address mismatch"
        );
        let signer_seeds = self.bonding_curve.get_vault_seeds();
        let signer = &[&signer_seeds[..]];
        // Transfer tokens to the treasury
        let token_transfer_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            anchor_spl::token_interface::TransferChecked {
                from: self.bonding_curve_token_account.to_account_info(),
                to: self.proposal_token_account.to_account_info(),
                mint: self.token_mint.to_account_info(),
                authority: self.bonding_curve_vault.to_account_info(),
            },
            signer
        );
        anchor_spl::token_interface::transfer_checked(
            token_transfer_ctx,
            token_amount,
            self.token_mint.decimals
        )?;

        let sol_amount = sol_amount.min(
            self.bonding_curve_vault
                .get_lamports()
                .checked_sub(Rent::get()?.minimum_balance(0))
                .unwrap_or(0)
        );
        // Here we'll transfer the SOL directly to the vault (assuming it can accept SOL)
        let sol_transfer_ix = system_instruction::transfer(
            &self.bonding_curve_vault.to_account_info().key,
            &self.proposal_treasury.key(),
            sol_amount
        );
        solana_program::program::invoke_signed(
            &sol_transfer_ix,
            &[
                self.bonding_curve_vault.to_account_info(),
                self.proposal_treasury.to_account_info(),
                self.system_program.to_account_info(),
            ],
            &[&self.bonding_curve.get_vault_seeds()[..]]
        )?;
        Ok(())
    }

    pub fn transfer_fee_for_migration(&self) -> Result<()> {
        assert!(
            self.fee_receiver.to_account_info().key() == self.global.fee_receiver,
            "Fee receiver address mismatch"
        );
        let fee_amount = self.global.migrate_fee_amount;
        let transfer_ix = system_instruction::transfer(
            self.creator.key,
            self.fee_receiver.key,
            fee_amount
        );
        solana_program::program::invoke(
            &transfer_ix,
            &[
                self.creator.to_account_info(),
                self.fee_receiver.to_account_info(),
                self.system_program.to_account_info(),
            ]
        )?;
        Ok(())
    }

    pub fn create_cpmm_pool(&mut self, funding_amount_wsol: u64, token_amount: u64) -> Result<()> {
        // get 20% of the real sol reserves as the funding amount for pool
        let migration_time = Clock::get()?.unix_timestamp as u64;
        let init_amount_0 = funding_amount_wsol; // the WSOL amount
        let init_amount_1 = token_amount;
        let accounts = cpi::accounts::Initialize {
            creator: self.bonding_curve_vault.to_account_info(),
            amm_config: self.amm_config.to_account_info(),
            authority: self.authority.to_account_info(),
            pool_state: self.pool_state.to_account_info(),
            token_0_mint: self.base_mint.to_account_info(),
            token_1_mint: self.token_mint.to_account_info(),
            lp_mint: self.lp_mint.to_account_info(),
            creator_token_0: self.bonding_curve_base_token_account.to_account_info(),
            creator_token_1: self.bonding_curve_token_account.to_account_info(),
            creator_lp_token: self.bonding_curve_lp_token.to_account_info(),
            token_0_vault: self.token_0_vault.to_account_info(),
            token_1_vault: self.token_1_vault.to_account_info(),
            create_pool_fee: self.create_pool_fee.to_account_info(),
            observation_state: self.observation_state.to_account_info(),
            token_program: self.token_program.to_account_info(),
            token_0_program: self.token_program.to_account_info(),
            token_1_program: self.token_1_program.to_account_info(),
            associated_token_program: self.associated_token_program.to_account_info(),
            system_program: self.system_program.to_account_info(),
            rent: self.rent.to_account_info(),
        };
        let signer = &[&self.bonding_curve.get_vault_seeds()[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            self.cp_swap_program.to_account_info(),
            accounts,
            signer
        );
        cpi::initialize(cpi_ctx, init_amount_0, init_amount_1, migration_time)
    }

    pub fn process(&mut self) -> Result<()> {
        assert!(self.bonding_curve.complete, "Bonding curve is not complete");
        self.revoke_mint_authority()?;
        let total_sol_raised = self.bonding_curve.real_sol_reserves;
        let cpmm_funding_amount = total_sol_raised.saturating_mul(20).checked_div(100).unwrap();
        let dao_vault_amount = total_sol_raised.checked_sub(cpmm_funding_amount).unwrap();
        let remaining_tokens = self.bonding_curve.token_total_supply.checked_div(2u64).unwrap();
        let cpmm_token_amount = remaining_tokens
            .checked_mul(30)
            .and_then(|n| n.checked_div(100))
            .unwrap();
        let dao_token_amount = remaining_tokens.checked_sub(cpmm_token_amount).unwrap();
        self.wrap_sol_for_cpmm(cpmm_funding_amount)?;
        self.create_cpmm_pool(cpmm_funding_amount, cpmm_token_amount)?;
        self.transfer_to_treasury(dao_vault_amount, dao_token_amount)?;
        self.transfer_fee_for_migration()?;
        Ok(())
    }
}
