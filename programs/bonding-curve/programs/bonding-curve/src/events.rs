use anchor_lang::prelude::*;

#[event]
pub struct TokensPurchased {
    pub bonding_curve: Pubkey,
    pub buyer: Pubkey,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub price_per_token: f64,
    pub timestamp: i64,
}

#[event]
pub struct TokensSold {
    pub bonding_curve: Pubkey,
    pub seller: Pubkey,
    pub token_amount: u64,
    pub sol_amount: u64,
    pub price_per_token: f64,
    pub timestamp: i64,
}

#[event]
pub struct TargetReached {
    pub bonding_curve: Pubkey,
    pub final_sol_raised: u64,
    pub timestamp: i64,
}

// We'll add more events for migration later
