use anchor_lang::{
    prelude::*,
    solana_program::{ self, native_token::LAMPORTS_PER_SOL, program::invoke, system_instruction },
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{ set_authority, spl_token::instruction::AuthorityType, SetAuthority },
    token_interface::{ Mint, TokenAccount, TokenInterface },
};
use raydium_cpmm_cpi::{
    cpi,
    program::RaydiumCpmm,
    states::{ AmmConfig, OBSERVATION_SEED, POOL_LP_MINT_SEED, POOL_SEED, POOL_VAULT_SEED },
};
use crate::{ errors::ContractError, BondingCurve, Global, Proposal };

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
    // Same account as either of the token accounts token_0 or token_1
    #[account(
        mut,
        constraint = project_token.key() == bonding_curve.token_mint @ ContractError::InvalidArgument,
    )]
    pub project_token: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        constraint = token_0_mint.key() < token_1_mint.key() @ ContractError::InvalidBaseMint,
    )]
    pub token_0_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub token_1_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        seeds=[BondingCurve::SEED_PREFIX.as_bytes(), project_token.key().as_ref()],
        constraint = bonding_curve.token_mint == project_token.key() @ ContractError::NotBondingCurveMint,
        bump = bonding_curve.bump
    )]
    pub bonding_curve: Box<Account<'info, BondingCurve>>,
    #[account(
        mut,
        seeds=[BondingCurve::VAULT_PREFIX.as_bytes(), project_token.key().as_ref()],
        bump=bonding_curve.vault_bump,
    )]
    pub bonding_curve_vault: SystemAccount<'info>,
    #[account(
        mut,
        associated_token::mint = token_0_mint,
        associated_token::authority= bonding_curve_vault,
    )]
    pub token_0_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = token_1_mint,
        associated_token::authority= bonding_curve_vault,
    )]
    pub token_1_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(seeds = [Proposal::SEED_PREFIX.as_bytes(), project_token.key().as_ref()], bump)]
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
        associated_token::mint = token_0_mint,
        associated_token::authority = proposal_authority,
        payer = creator
    )]
    pub proposal_token_0_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = token_1_mint,
        associated_token::authority = proposal_authority
    )]
    pub proposal_token_1_account: Box<InterfaceAccount<'info, TokenAccount>>,
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
            token_0_mint.key().as_ref(),
            token_1_mint.key().as_ref(),
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
            token_0_mint.key().as_ref()
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
            token_1_mint.key().as_ref()
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
            account_or_mint: self.project_token.to_account_info(),
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

    pub fn fund_vault_for_pool_creation(&self) -> Result<()> {
        let required_lamports = LAMPORTS_PER_SOL.checked_mul(12u64)
            .unwrap()
            .checked_div(10u64)
            .unwrap(); // An expected amount for pool creation and other transfers
        let transfer_ix = system_instruction::transfer(
            self.creator.key,
            self.bonding_curve_vault.key,
            required_lamports
        );
        invoke(
            &transfer_ix,
            &[
                self.creator.to_account_info(),
                self.bonding_curve_vault.to_account_info(),
                self.system_program.to_account_info(),
            ]
        )?;
        Ok(())
    }

    pub fn transfer_to_vault(
        &mut self,
        base_amount: u64,
        token_amount: u64,
        is_base_mint_0: bool
    ) -> Result<()> {
        let treasury_address = self.proposal.treasury_address;
        require!(
            self.proposal_authority.key() == self.proposal.authority_address,
            ContractError::InvalidProposalAuthority
        );
        require!(self.proposal_treasury.key() == treasury_address, ContractError::InvalidTreasury);
        let signer_seeds = self.bonding_curve.get_vault_seeds();
        let signer = &[&signer_seeds[..]];

        // We do everything by assuming token_0 is the base mint, so swap the base and token mint if it's not
        let (base_amount, token_amount) = if is_base_mint_0 {
            (base_amount, token_amount)
        } else {
            (token_amount, base_amount)
        };

        // Transfer project tokens to the treasury
        let token_transfer_ctx = CpiContext::new_with_signer(
            self.token_1_program.to_account_info(),
            anchor_spl::token_interface::TransferChecked {
                from: self.token_1_account.to_account_info(),
                to: self.proposal_token_1_account.to_account_info(),
                mint: self.token_1_mint.to_account_info(),
                authority: self.bonding_curve_vault.to_account_info(),
            },
            signer
        );
        anchor_spl::token_interface::transfer_checked(
            token_transfer_ctx,
            token_amount,
            self.token_1_mint.decimals
        )?;

        // Transfer the base amount (WSOL/USD*) to the proposal authority
        let base_transfer_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            anchor_spl::token_interface::TransferChecked {
                from: self.token_0_account.to_account_info(),
                to: self.proposal_token_0_account.to_account_info(),
                mint: self.token_0_mint.to_account_info(),
                authority: self.bonding_curve_vault.to_account_info(),
            },
            signer
        );
        anchor_spl::token_interface::transfer_checked(
            base_transfer_ctx,
            base_amount.min(self.token_0_account.amount),
            self.token_0_mint.decimals
        )?;

        msg!("Transferred {} tokens to treasury", base_amount.min(self.token_0_account.amount));
        Ok(())
    }

    pub fn transfer_fee_for_migration(&self) -> Result<()> {
        // let's accept the fee in SOL for now
        require!(
            self.fee_receiver.key() == self.global.fee_receiver,
            ContractError::InvalidFeeReceiver
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

    pub fn create_cpmm_pool(&mut self, init_amount_0: u64, init_amount_1: u64) -> Result<()> {
        // get 20% of the real base reserves as the funding amount for pool
        let migration_time = Clock::get()?.unix_timestamp as u64;
        let accounts = cpi::accounts::Initialize {
            creator: self.bonding_curve_vault.to_account_info(),
            amm_config: self.amm_config.to_account_info(),
            authority: self.authority.to_account_info(),
            pool_state: self.pool_state.to_account_info(),
            token_0_mint: self.token_0_mint.to_account_info(),
            token_1_mint: self.token_1_mint.to_account_info(),
            lp_mint: self.lp_mint.to_account_info(),
            creator_token_0: self.token_0_account.to_account_info(),
            creator_token_1: self.token_1_account.to_account_info(),
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
        require!(self.bonding_curve.complete, ContractError::NotCompleted);
        self.revoke_mint_authority()?;
        msg!("Revoked mint authority");

        // Check which mint is the base mint and which is the token mint
        let is_base_mint_0 = self.token_0_mint.key() == self.bonding_curve.base_mint;

        // Calculate funding amounts
        let total_base_raised = self.bonding_curve.real_base_reserves;
        msg!("Total base raised: {}", total_base_raised);
        msg!("Actual amount available in the vault: {}", if is_base_mint_0 {
            self.token_0_account.amount
        } else {
            self.token_1_account.amount
        });
        let cpmm_base_amount = total_base_raised.saturating_mul(20).checked_div(100).unwrap();
        let vault_base_amount = total_base_raised.checked_sub(cpmm_base_amount).unwrap();

        // Calculate token amounts
        let remaining_tokens = self.bonding_curve.token_total_supply.checked_div(2u64).unwrap();
        let cpmm_token_amount = remaining_tokens
            .checked_mul(30)
            .and_then(|n| n.checked_div(100))
            .unwrap();
        let vault_token_amount = remaining_tokens.checked_sub(cpmm_token_amount).unwrap();

        msg!("Funding amounts: {} base, {} token", cpmm_base_amount, cpmm_token_amount);
        // Fund the vault for pool creation
        self.fund_vault_for_pool_creation()?;
        msg!("Funded 0.5 SOL to the vault for pool creation");
        // Create the CPMM pool
        self.create_cpmm_pool(
            if is_base_mint_0 {
                cpmm_base_amount
            } else {
                cpmm_token_amount
            },
            if is_base_mint_0 {
                cpmm_token_amount
            } else {
                cpmm_base_amount
            }
        )?;
        msg!("Created CPMM pool");
        // Transfer remaining funds to the treasury
        self.transfer_to_vault(vault_base_amount, vault_token_amount, is_base_mint_0)?;
        msg!("Transferred {} base and {} token to treasury", vault_base_amount, vault_token_amount);
        // Transfer migration fee
        self.transfer_fee_for_migration()?;
        msg!("Transferred migration fee to {}", self.global.fee_receiver);
        Ok(())
    }
}
