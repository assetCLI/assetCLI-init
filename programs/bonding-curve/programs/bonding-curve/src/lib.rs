#![allow(unexpected_cfgs)]

declare_id!("C2LfjaKea6KJ15zXDzxghTSErN6xEqUnHzpg2Vrpdjnu");
mod instructions;
mod state;
mod errors;
mod events; // Add the events module

pub use instructions::*;
pub use state::*;
pub use events::*; // Export the events

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

    // Migration functionality will be added later
}
