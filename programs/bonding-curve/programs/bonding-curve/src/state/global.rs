pub use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug, PartialEq)]
pub enum ProgramStatus {
    Running,
    SwapOnly,
    SwapOnlyNoLaunch,
    Paused,
}

#[account]
#[derive(InitSpace)]
pub struct Global {
    pub status: ProgramStatus,
    pub initialized: bool,
    pub global_authority: Pubkey,
    pub migrate_fee_amount: u64,
    pub fee_receiver: Pubkey,
    pub bump: u8,
}

impl Global {
    pub const SEED_PREFIX: &'static str = "global";

    pub fn get_signer(&self) -> [&[u8]; 2] {
        let prefix_bytes = Self::SEED_PREFIX.as_bytes();
        let bump_slice = std::slice::from_ref(&self.bump);
        [prefix_bytes, bump_slice]
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct GlobalSettingsInput {
    pub migrate_fee_amount: Option<u64>,
    pub fee_receiver: Option<Pubkey>,
    pub status: Option<ProgramStatus>,
}
