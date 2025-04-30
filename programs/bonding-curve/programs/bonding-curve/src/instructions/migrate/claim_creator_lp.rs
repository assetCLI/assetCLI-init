use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{ self, Mint, TokenAccount, TokenInterface },
};

use crate::{ errors::ContractError, BondingCurve, Global, Proposal };

#[derive(Accounts)]
pub struct ClaimCreatorLp<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = lp_mint,
        associated_token::authority = proposal_authority
    )]
    pub creator_lp_token_account: InterfaceAccount<'info, TokenAccount>,
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
        seeds=[BondingCurve::SEED_PREFIX.as_bytes(), token_mint.key().as_ref()],
        constraint = bonding_curve.token_mint == token_mint.key() @ ContractError::NotBondingCurveMint,
        bump = bonding_curve.bump
    )]
    pub bonding_curve: Box<Account<'info, BondingCurve>>,
    #[account(seeds = [Proposal::SEED_PREFIX.as_bytes(), token_mint.key().as_ref()], bump)]
    pub proposal: Box<Account<'info, Proposal>>,
    /// CHECK: Proposal authority, assert in validation function
    #[account(mut)]
    pub proposal_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [BondingCurve::VAULT_PREFIX.as_bytes(), token_mint.key().as_ref()],
        bump=bonding_curve.vault_bump,
    )]
    pub bonding_curve_vault: SystemAccount<'info>,
    pub lp_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = lp_mint,
        associated_token::authority = bonding_curve_vault,
    )]
    pub bonding_curve_lp_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> ClaimCreatorLp<'info> {
    pub fn process(&mut self) -> Result<()> {
        require!(self.bonding_curve.complete, ContractError::NotCompleted);
        require!(
            self.bonding_curve_lp_token_account.mint == self.lp_mint.key(),
            ContractError::InvalidLPMint
        );
        require!(
            self.bonding_curve_lp_token_account.owner == self.bonding_curve_vault.key(),
            ContractError::InvalidProposalAuthority
        );

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: self.bonding_curve_lp_token_account.to_account_info(),
                    mint: self.lp_mint.to_account_info(),
                    to: self.creator_lp_token_account.to_account_info(),
                    authority: self.bonding_curve_vault.to_account_info(),
                },
                &[&self.bonding_curve.get_vault_seeds()[..]]
            ),
            self.bonding_curve_lp_token_account.amount,
            self.lp_mint.decimals
        )?;

        token_interface::close_account(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                token_interface::CloseAccount {
                    account: self.bonding_curve_lp_token_account.to_account_info(),
                    destination: self.creator.to_account_info(),
                    authority: self.bonding_curve_vault.to_account_info(),
                },
                &[&self.bonding_curve.get_vault_seeds()[..]]
            )
        )?;
        Ok(())
    }
}
