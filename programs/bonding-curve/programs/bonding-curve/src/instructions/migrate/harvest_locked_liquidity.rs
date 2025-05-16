use anchor_lang::prelude::*;
use anchor_spl::{ memo::spl_memo, token_interface::{ Mint, TokenAccount, TokenInterface } };
use raydium_cpmm_cpi::{
    program::RaydiumCpmm,
    states::{ AmmConfig, POOL_LP_MINT_SEED, POOL_VAULT_SEED },
};

use raydium_locking_cpi::{
    cpi,
    program::RaydiumLiquidityLocking,
    states::{ LockedCpLiquidityState, LOCKED_LIQUIDITY_SEED },
};

#[derive(Accounts)]
pub struct HarvestLockedLiquidity<'info> {
    pub lock_cpmm_program: Program<'info, RaydiumLiquidityLocking>,
    pub cp_swap_program: Program<'info, RaydiumCpmm>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub amm_config: Account<'info, AmmConfig>,
    /// CHECK: the authority of token vault that cp is locked
    #[account(mut)]
    pub authority: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::authority = creator,
        associated_token::mint = locked_liquidity.fee_nft_mint
    )]
    pub fee_nft_account: InterfaceAccount<'info, TokenAccount>,
    #[account( 
        mut,
        seeds = [
            LOCKED_LIQUIDITY_SEED.as_bytes(),
            locked_liquidity.fee_nft_mint.key().as_ref(),
        ],
        seeds::program = lock_cpmm_program.key(),
        bump
    )]
    pub locked_liquidity: Account<'info, LockedCpLiquidityState>,
    /// CHECK: pool vault and lp mint authority
    #[account(
        seeds = [raydium_cpmm_cpi::AUTH_SEED.as_bytes()],
        seeds::program = cp_swap_program.key(),
        bump
    )]
    pub cp_authority: UncheckedAccount<'info>,
    /// CHECK:
    #[account(
        mut,
        address = locked_liquidity.pool_id
    )]
    pub pool_state: UncheckedAccount<'info>,
    /// CHECK: Checked by the constraints
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
    #[account(     
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = creator,
    )]
    pub base_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(     
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = creator,
    )]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Checked by the constraints
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
    /// CHECK: Checked by the constraints
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
        associated_token::mint = lp_mint,
        associated_token::authority = authority,
    )]
    pub locked_lp_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
    /// CHECK: memo program checked by constraint
    #[account(address = spl_memo::id())]
    pub memo_program: UncheckedAccount<'info>,
    pub token_0_program: Interface<'info, TokenInterface>,
    pub token_1_program: Interface<'info, TokenInterface>,
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,
}

impl<'info> HarvestLockedLiquidity<'info> {
    pub fn process(&mut self) -> Result<()> {
        let fee_lp_amount = self.locked_lp_vault.amount;

        let cpi_accounts = cpi::accounts::CollectCpFee {
            authority: self.authority.to_account_info(),
            fee_nft_owner: self.creator.to_account_info(),
            fee_nft_account: self.fee_nft_account.to_account_info(),
            locked_liquidity: self.locked_liquidity.to_account_info(),
            cpmm_program: self.cp_swap_program.to_account_info(),
            cp_authority: self.cp_authority.to_account_info(),
            pool_state: self.pool_state.to_account_info(),
            lp_mint: self.lp_mint.to_account_info(),
            recipient_token_0_account: self.base_vault.to_account_info(),
            recipient_token_1_account: self.token_vault.to_account_info(),
            token_0_vault: self.token_0_vault.to_account_info(),
            token_1_vault: self.token_1_vault.to_account_info(),
            vault_0_mint: self.base_mint.to_account_info(),
            vault_1_mint: self.token_mint.to_account_info(),
            locked_lp_vault: self.locked_lp_vault.to_account_info(),
            token_program: self.token_0_program.to_account_info(),
            token_program_2022: self.token_1_program.to_account_info(),
            memo_program: self.memo_program.to_account_info(),
        };

        let cpi_context = CpiContext::new(self.lock_cpmm_program.to_account_info(), cpi_accounts);
        cpi::collect_cp_fees(cpi_context, fee_lp_amount)?;

        Ok(())
    }
}
