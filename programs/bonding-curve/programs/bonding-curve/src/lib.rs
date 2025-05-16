#![allow(unexpected_cfgs)]

declare_id!("7siqXYsVP5JZj16HhA1Vcqad6t3SBxH5mPK6GyDdnFnr");
mod instructions;
mod state;
mod errors;
mod events;
mod constants;

pub use instructions::*;
pub use state::*;
pub use events::*;
pub use constants::*;

#[program]
pub mod bonding_curve {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: GlobalSettingsInput) -> Result<()> {
        ctx.accounts.process(params, &ctx.bumps)
    }

    pub fn create_bonding_curve(
        ctx: Context<CreateBondingCurve>,
        params: CreateBondingCurveParams
    ) -> Result<()> {
        ctx.accounts.process(params, &ctx.bumps)
    }

    pub fn swap(ctx: Context<Swap>, params: SwapParams) -> Result<()> {
        ctx.accounts.process(params)
    }

    pub fn create_raydium_pool(ctx: Context<CreateRaydiumPool>) -> Result<()> {
        ctx.accounts.process()
    }

    pub fn claim_creator_lp(ctx: Context<ClaimCreatorLp>) -> Result<()> {
        ctx.accounts.process()
    }

    pub fn lock_cpmm_liquidity(ctx: Context<LockCpmmLiquidity>) -> Result<()> {
        ctx.accounts.process()
    }

    pub fn harvest_locked_cpmm_liquidity(ctx: Context<HarvestLockedLiquidity>) -> Result<()> {
        ctx.accounts.process()
    }

    pub fn raydium_swap(
        ctx: Context<RaydiumSwap>,
        amount_in: u64,
        minimum_amount_out: u64
    ) -> Result<()> {
        ctx.accounts.process(amount_in, minimum_amount_out)
    }
}
