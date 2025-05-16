use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::Metadata,
    token_interface::{ Mint, TokenInterface, TokenAccount },
};

use raydium_cpmm_cpi::{
    program::RaydiumCpmm,
    states::{ AmmConfig, POOL_LP_MINT_SEED, POOL_SEED, POOL_VAULT_SEED },
};

use raydium_locking_cpi::{ cpi, program::RaydiumLiquidityLocking, states::LOCKED_LIQUIDITY_SEED };
#[derive(Accounts)]
pub struct LockCpmmLiquidity<'info> {
    pub cp_swap_program: Program<'info, RaydiumCpmm>,
    pub lock_cpmm_program: Program<'info, RaydiumLiquidityLocking>,
    // auth of the lp, who wants to lock lp
    #[account(mut)]
    pub user: Signer<'info>,
    pub amm_config: Account<'info, AmmConfig>,
    /// CHECK: the authority of token vault that cp is locked
    #[account(mut)]
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub fee_nft_mint: Signer<'info>,
    /// CHECK: Checked by the CPI
    #[account(mut)]
    pub fee_nft_acc: UncheckedAccount<'info>,
    /// CHECK: Checked by the constraint
    #[account(
        seeds = [
            POOL_SEED.as_bytes(),
            amm_config.key().as_ref(),
            base_mint.key().as_ref(),
            token_mint.key().as_ref(),
        ],
        seeds::program = cp_swap_program.key(),
        bump
    )]
    pub pool_state: UncheckedAccount<'info>,
    /// CHECK:
    #[account( 
        mut,
        seeds = [
            LOCKED_LIQUIDITY_SEED.as_bytes(),
            fee_nft_mint.key().as_ref(),
        ],
        seeds::program = lock_cpmm_program.key(),
        bump
    )]
    pub locked_liquidity: UncheckedAccount<'info>,
    /// The mint of liquidity token
    /// address = pool_state.lp_mint
    /// CHECK: Checked by constraint seeds
    #[account(
        mut,
        seeds = [POOL_LP_MINT_SEED.as_bytes(), pool_state.key().as_ref()],
        seeds::program = cp_swap_program.key(),
        bump
    )]
    pub lp_mint: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = lp_mint,
        associated_token::authority = user,
    )]
    pub user_lp_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Checked by the locking program
    #[account(mut)]
    pub locked_lp_vault: UncheckedAccount<'info>,
    /// CHECK: Checked by constraints seeds
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
    /// CHECK: Checked by constraints seeds
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
    /// CHECK: this account will be init by token metadata
    #[account(mut)]
    pub metadata: AccountInfo<'info>,
    pub metadata_program: Program<'info, Metadata>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: Interface<'info, TokenInterface>,
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,
}

impl<'info> LockCpmmLiquidity<'info> {
    pub fn process(&mut self) -> Result<()> {
        let lp_amount = self.user_lp_token_account.amount;
        let cpi_accounts = cpi::accounts::LockCpLiquidity {
            authority: self.authority.to_account_info(),
            payer: self.user.to_account_info(),
            liquidity_owner: self.user.to_account_info(),
            fee_nft_owner: self.user.to_account_info(),
            fee_nft_mint: self.fee_nft_mint.to_account_info(),
            fee_nft_account: self.fee_nft_acc.to_account_info(),
            pool_state: self.pool_state.to_account_info(),
            locked_liquidity: self.locked_liquidity.to_account_info(),
            lp_mint: self.lp_mint.to_account_info(),
            liquidity_owner_lp: self.user_lp_token_account.to_account_info(),
            locked_lp_vault: self.locked_lp_vault.to_account_info(),
            token_0_vault: self.token_0_vault.to_account_info(),
            token_1_vault: self.token_1_vault.to_account_info(),
            metadata_account: self.metadata.to_account_info(),
            rent: self.rent.to_account_info(),
            system_program: self.system_program.to_account_info(),
            token_program: self.token_program.to_account_info(),
            associated_token_program: self.associated_token_program.to_account_info(),
            metadata_program: self.metadata_program.to_account_info(),
        };
        let cpi_context = CpiContext::new(self.lock_cpmm_program.to_account_info(), cpi_accounts);
        cpi::lock_cp_liquidity(cpi_context, lp_amount, false)?;

        Ok(())
    }
}
