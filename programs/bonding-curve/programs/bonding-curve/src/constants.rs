use anchor_lang::solana_program::native_token::LAMPORTS_PER_SOL;

pub const FUNDING_AMOUNT: u64 = LAMPORTS_PER_SOL;
pub const DEFAULT_SUPPLY: u64 = 100_000_000 * (10u64).pow(DEFAULT_DECIMALS as u32);
pub const DEFAULT_DECIMALS: u8 = 6;
pub const DEFAULT_MIGRATION_FEE: u64 = 500;
