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
    pub initial_virtual_token_reserves: u64,
    pub initial_virtual_sol_reserves: u64,
    pub initial_real_token_reserves: u64,
    pub token_total_supply: u64,
    pub mint_decimals: u8,
    pub whitelist_enabled: bool,
    pub bump: u8,
}

impl Default for Global {
    fn default() -> Self {
        Self {
            status: ProgramStatus::Running,
            initialized: true,
            global_authority: Pubkey::default(),
            migrate_fee_amount: 500,
            fee_receiver: Pubkey::default(),
            initial_virtual_token_reserves: 100_000_000_000_000, // 100M with 6 decimals
            initial_virtual_sol_reserves: 30000000000, // Initial SOL pricing parameter
            // Only 50% of supply available for trading
            initial_real_token_reserves: 50_000_000_000_000, // 50M with 6 decimals
            token_total_supply: 100_000_000_000_000, // Total 100M tokens
            mint_decimals: 6,
            whitelist_enabled: false,
            bump: 0,
        }
    }
}

impl Global {
    pub const SEED_PREFIX: &'static str = "global";

    pub fn get_signer(&self) -> [&[u8]; 2] {
        let prefix_bytes = Self::SEED_PREFIX.as_bytes();
        let bump_slice = std::slice::from_ref(&self.bump);
        [prefix_bytes, bump_slice]
    }
    pub fn update_settings(&mut self, params: GlobalSettingsInput) {
        if let Some(mint_decimals) = params.mint_decimals {
            self.mint_decimals = mint_decimals;
        }
        if let Some(status) = params.status {
            self.status = status;
        }
        if let Some(initial_virtual_token_reserves) = params.initial_virtual_token_reserves {
            self.initial_virtual_token_reserves = initial_virtual_token_reserves;
        }
        if let Some(initial_virtual_sol_reserves) = params.initial_virtual_sol_reserves {
            self.initial_virtual_sol_reserves = initial_virtual_sol_reserves;
        }
        if let Some(initial_real_token_reserves) = params.initial_real_token_reserves {
            self.initial_real_token_reserves = initial_real_token_reserves;
        }
        if let Some(token_total_supply) = params.token_total_supply {
            self.token_total_supply = token_total_supply;
        }
        if let Some(migrate_fee_amount) = params.migrate_fee_amount {
            self.migrate_fee_amount = migrate_fee_amount;
        }
        if let Some(fee_receiver) = params.fee_receiver {
            self.fee_receiver = fee_receiver;
        }
        if let Some(whitelist_enabled) = params.whitelist_enabled {
            self.whitelist_enabled = whitelist_enabled;
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct GlobalSettingsInput {
    pub initial_virtual_token_reserves: Option<u64>,
    pub initial_virtual_sol_reserves: Option<u64>,
    pub initial_real_token_reserves: Option<u64>,
    pub token_total_supply: Option<u64>,
    pub mint_decimals: Option<u8>,
    pub migrate_fee_amount: Option<u64>,
    pub fee_receiver: Option<Pubkey>,
    pub status: Option<ProgramStatus>,
    pub whitelist_enabled: Option<bool>,
}
