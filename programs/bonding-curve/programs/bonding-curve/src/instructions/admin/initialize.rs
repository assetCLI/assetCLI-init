use anchor_lang::prelude::*;

use crate::{ errors::ContractError, state::{ Global, GlobalSettingsInput }, DEFAULT_MIGRATION_FEE };

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        seeds=[Global::SEED_PREFIX.as_bytes()],
        bump,
        constraint = global.initialized != true @ ContractError::AlreadyInitialized,
        space= 8 + Global::INIT_SPACE,
        payer=admin,
    )]
    pub global: Box<Account<'info, Global>>,
    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn process(&mut self, params: GlobalSettingsInput, bumps: &InitializeBumps) -> Result<()> {
        self.global.set_inner(Global {
            status: params.status.unwrap_or(crate::ProgramStatus::Running),
            initialized: true,
            global_authority: self.admin.key(),
            migrate_fee_amount: params.migrate_fee_amount.unwrap_or(DEFAULT_MIGRATION_FEE),
            fee_receiver: self.admin.key(),
            bump: bumps.global,
        });
        Ok(())
    }
}
