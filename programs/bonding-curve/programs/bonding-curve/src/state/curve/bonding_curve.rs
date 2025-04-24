use anchor_lang::prelude::*;

use crate::{ errors::ContractError, DEFAULT_DECIMALS, DEFAULT_SUPPLY };
pub fn bps_mul(bps: u64, value: u64, divisor: u64) -> Option<u64> {
    bps_mul_raw(bps, value, divisor).unwrap().try_into().ok()
}

pub fn bps_mul_raw(bps: u64, value: u64, divisor: u64) -> Option<u128> {
    (value as u128).checked_mul(bps as u128)?.checked_div(divisor as u128)
}

#[account]
#[derive(InitSpace, Debug, Default)]
pub struct BondingCurve {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub token_total_supply: u64,
    pub start_time: i64,
    pub complete: bool,
    pub token_decimals: u8,
    pub sol_raise_target: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateBondingCurveParams {
    // Token metadata
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub sol_raise_target: u64,
    pub decimals: Option<u8>,
    pub token_total_supply: Option<u64>,
    // Proposal Metadata
    pub description: String,
    pub treasury_address: Pubkey,
    pub authority_address: Pubkey,
    pub twitter_handle: Option<String>,
    pub discord_link: Option<String>,
    pub website_url: Option<String>,
    pub logo_uri: Option<String>,
    pub founder_name: Option<String>,
    pub founder_twitter: Option<String>,
    pub bullish_thesis: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BuyResult {
    /// Amount of tokens that the user will receive
    pub token_amount: u64,
    /// Amount of SOL that the user paid
    pub sol_amount: u64,
    /// Price per token in SOL
    pub price_per_token: f64,
}

#[derive(Debug, Clone)]
pub struct SellResult {
    /// Amount of tokens that the user is selling
    pub token_amount: u64,
    /// Amount of SOL that the user will receive
    pub sol_amount: u64,
    /// Price per token in SOL
    pub price_per_token: f64,
}

impl BondingCurve {
    // Change this to match the seed used in CreateBondingCurve account initialization
    pub const SEED_PREFIX: &'static str = "bonding_curve";
    pub const TOKEN_PREFIX: &'static str = "bonding_curve_token";
    pub const VAULT_PREFIX: &'static str = "bonding_curve_vault";

    pub fn calculate_fee(&self, amount: u64, time_now: i64) -> Result<u64> {
        let start_time = self.start_time;
        let time_diff = time_now.saturating_sub(start_time);
        let slots_passed = time_diff / 400;

        let mut sol_fee: u64 = 0;

        if slots_passed < 150 {
            sol_fee = bps_mul(9900, amount, 10_000).unwrap();
        } else if slots_passed >= 150 && slots_passed <= 250 {
            // Calculate the minimum fee bps (at slot 250) scaled by 10000 for precision
            let fee_bps = (-8_300_000_i64)
                .checked_mul(slots_passed)
                .ok_or(ContractError::ArithmeticError)?
                .checked_add(2_162_600_000)
                .ok_or(ContractError::ArithmeticError)?
                .checked_div(1_000_000)
                .ok_or(ContractError::ArithmeticError)?;
            sol_fee = bps_mul(fee_bps as u64, amount, 10_000).unwrap();
        } else if slots_passed > 250 {
            sol_fee = bps_mul(100, amount, 10_000).unwrap();
        }
        sol_fee = sol_fee.min(amount / 10);
        Ok(sol_fee)
    }

    pub fn get_signer_seeds(&self) -> [&[u8]; 3] {
        [Self::SEED_PREFIX.as_bytes(), self.mint.as_ref(), std::slice::from_ref(&self.bump)]
    }

    pub fn get_vault_seeds(&self) -> [&[u8]; 3] {
        [Self::VAULT_PREFIX.as_bytes(), self.mint.as_ref(), std::slice::from_ref(&self.vault_bump)]
    }

    pub fn is_started(&self, clock: &Clock) -> bool {
        let now = clock.unix_timestamp;
        now >= self.start_time
    }

    pub fn update_from_params(
        &mut self,
        mint: Pubkey,
        creator: Pubkey,
        params: &CreateBondingCurveParams,
        clock: &Clock,
        bump: u8,
        vault_bump: u8
    ) -> &mut Self {
        let start_time = clock.unix_timestamp;
        let creator = creator;
        let complete = false;

        let sol_raise_target: u64 = params.sol_raise_target;
        let decimals = params.decimals.unwrap_or(DEFAULT_DECIMALS);
        let token_total_supply = params.token_total_supply.unwrap_or(DEFAULT_SUPPLY);
        let virtual_token_reserves = token_total_supply;
        let real_token_reserves = virtual_token_reserves / 2; // 50% of the total supply
        self.clone_from(
            &(BondingCurve {
                mint,
                creator,
                virtual_token_reserves,
                virtual_sol_reserves: params.sol_raise_target,
                real_sol_reserves: 0,
                real_token_reserves,
                token_total_supply,
                token_decimals: decimals,
                start_time,
                complete,
                bump,
                sol_raise_target,
                vault_bump,
            })
        );
        self
    }

    // Debug version of apply_buy that logs each key step.
    pub fn apply_buy_debug(&mut self, mut sol_amount: u64) -> Option<BuyResult> {
        // Check SOL raise target.
        if self.sol_raise_target > 0 {
            let potential_new_sol_reserves = self.real_sol_reserves.checked_add(sol_amount)?;
            if potential_new_sol_reserves >= self.sol_raise_target {
                self.complete = true;
            }
        }

        // Compute token amount from SOL amount.
        let mut token_amount = self.get_tokens_for_buy_sol(sol_amount)?;

        // Check if purchase would exceed token reserves.
        if token_amount >= self.real_token_reserves {
            token_amount = self.real_token_reserves;
            sol_amount = self.get_sol_for_exact_tokens(token_amount)?;
            self.complete = true;
        }
        // Adjust reserves.
        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_sub(
            token_amount as u128
        )?;
        let new_real_token_reserves = (self.real_token_reserves as u128).checked_sub(
            token_amount as u128
        )?;
        let new_virtual_sol_reserves = (self.virtual_sol_reserves as u128).checked_add(
            sol_amount as u128
        )?;
        let new_real_sol_reserves = (self.real_sol_reserves as u128).checked_add(
            sol_amount as u128
        )?;
        let price_per_token = if token_amount > 0 {
            (sol_amount as f64) / (token_amount as f64)
        } else {
            0.0
        };

        // Update state.
        self.virtual_token_reserves = new_virtual_token_reserves.try_into().ok()?;
        self.real_token_reserves = new_real_token_reserves.try_into().ok()?;
        self.virtual_sol_reserves = new_virtual_sol_reserves.try_into().ok()?;
        self.real_sol_reserves = new_real_sol_reserves.try_into().ok()?;
        Some(BuyResult {
            token_amount,
            sol_amount,
            price_per_token,
        })
    }

    // Debug version of apply_sell that logs each key step.
    pub fn apply_sell_debug(&mut self, token_amount: u64) -> Option<SellResult> {
        let sol_amount = self.get_sol_for_sell_tokens(token_amount)?;

        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_add(
            token_amount as u128
        )?;
        let new_real_token_reserves = (self.real_token_reserves as u128).checked_add(
            token_amount as u128
        )?;
        let new_virtual_sol_reserves = (self.virtual_sol_reserves as u128).checked_sub(
            sol_amount as u128
        )?;
        let new_real_sol_reserves = self.real_sol_reserves.checked_sub(sol_amount)?;
        let price_per_token = if token_amount > 0 {
            (sol_amount as f64) / (token_amount as f64)
        } else {
            0.0
        };

        // Update state.
        self.virtual_token_reserves = new_virtual_token_reserves.try_into().ok()?;
        self.real_token_reserves = new_real_token_reserves.try_into().ok()?;
        self.virtual_sol_reserves = new_virtual_sol_reserves.try_into().ok()?;
        self.real_sol_reserves = new_real_sol_reserves;

        Some(SellResult {
            token_amount,
            sol_amount,
            price_per_token,
        })
    }

    pub fn apply_buy(&mut self, mut sol_amount: u64) -> Option<BuyResult> {
        // Check if we're reaching or exceeding the SOL raise target
        if self.sol_raise_target > 0 {
            let potential_new_sol_reserves = self.real_sol_reserves.checked_add(sol_amount)?;
            if potential_new_sol_reserves >= self.sol_raise_target {
                // Mark as complete (will trigger migration path later)
                self.complete = true;
            }
        }

        let mut token_amount = self.get_tokens_for_buy_sol(sol_amount)?;

        // Check if this purchase would exceed the token reserves
        if token_amount >= self.real_token_reserves {
            // Last Buy - just buy all remaining tokens
            token_amount = self.real_token_reserves;
            // Calculate SOL amount needed using the bonding curve formula
            // This ensures pricing is consistent with the curve
            sol_amount = self.get_sol_for_exact_tokens(token_amount)?;
            // Mark the curve as complete
            self.complete = true;
        }

        // Adjusting token reserve values
        // New Virtual Token Reserves
        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_sub(
            token_amount as u128
        )?;

        // New Real Token Reserves
        let new_real_token_reserves = (self.real_token_reserves as u128).checked_sub(
            token_amount as u128
        )?;
        // Adjusting sol reserve values
        // New Virtual Sol Reserves
        let new_virtual_sol_reserves = (self.virtual_sol_reserves as u128).checked_add(
            sol_amount as u128
        )?;
        // New Real Sol Reserves
        let new_real_sol_reserves = (self.real_sol_reserves as u128).checked_add(
            sol_amount as u128
        )?;
        // Calculate price per token
        let price_per_token = if token_amount > 0 {
            (sol_amount as f64) / (token_amount as f64)
        } else {
            0.0
        };

        self.virtual_token_reserves = new_virtual_token_reserves.try_into().ok()?;
        self.real_token_reserves = new_real_token_reserves.try_into().ok()?;
        self.virtual_sol_reserves = new_virtual_sol_reserves.try_into().ok()?;
        self.real_sol_reserves = new_real_sol_reserves.try_into().ok()?;
        Some(BuyResult {
            token_amount,
            sol_amount,
            price_per_token,
        })
    }

    pub fn apply_sell(&mut self, token_amount: u64) -> Option<SellResult> {
        // Computing Sol Amount out
        let sol_amount = self.get_sol_for_sell_tokens(token_amount)?;
        // Check if bonding curve has enough SOL to fulfill the sell request
        if sol_amount > self.real_sol_reserves {
            return None;
        }

        // Adjusting token reserve values
        // New Virtual Token Reserves
        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_add(
            token_amount as u128
        )?;
        // New Real Token Reserves
        let new_real_token_reserves = (self.real_token_reserves as u128).checked_add(
            token_amount as u128
        )?;
        // Adjusting sol reserve values
        // New Virtual Sol Reserves
        let new_virtual_sol_reserves = (self.virtual_sol_reserves as u128).checked_sub(
            sol_amount as u128
        )?;
        // New Real Sol Reserves
        let new_real_sol_reserves = self.real_sol_reserves.checked_sub(sol_amount)?;
        // Calculate price per token
        let price_per_token = if token_amount > 0 {
            (sol_amount as f64) / (token_amount as f64)
        } else {
            0.0
        };

        self.virtual_token_reserves = new_virtual_token_reserves.try_into().ok()?;
        self.real_token_reserves = new_real_token_reserves.try_into().ok()?;
        self.virtual_sol_reserves = new_virtual_sol_reserves.try_into().ok()?;
        self.real_sol_reserves = new_real_sol_reserves;
        Some(SellResult {
            token_amount,
            sol_amount,
            price_per_token,
        })
    }

    pub fn get_tokens_for_buy_sol(&self, sol_amount: u64) -> Option<u64> {
        if sol_amount == 0 {
            return None;
        }
        // Calculate constant k = virtual_sol * virtual_token
        let k = (self.virtual_sol_reserves as u128).checked_mul(
            self.virtual_token_reserves as u128
        )?;
        // Calculate new virtual SOL reserves after adding input SOL
        let new_virtual_sol_reserves = (self.virtual_sol_reserves as u128).checked_add(
            sol_amount as u128
        )?;
        // Calculate new virtual token reserves: k / new_sol_reserves
        let new_virtual_token_reserves = k.checked_div(new_virtual_sol_reserves)?;
        // Calculate tokens received
        let tokens_received = (self.virtual_token_reserves as u128).checked_sub(
            new_virtual_token_reserves
        )?;
        // Safely convert to u64
        let recv = tokens_received.try_into().ok()?;
        Some(recv)
    }

    pub fn get_sol_for_sell_tokens(&self, token_amount: u64) -> Option<u64> {
        if token_amount == 0 {
            return None;
        }
        // Calculate constant k = virtual_sol * virtual_token
        let k = (self.virtual_sol_reserves as u128).checked_mul(
            self.virtual_token_reserves as u128
        )?;
        // Calculate new virtual token reserves after adding input tokens
        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_add(
            token_amount as u128
        )?;
        // Calculate new virtual SOL reserves: k / new_token_reserves
        let new_virtual_sol_reserves = k.checked_div(new_virtual_token_reserves)?;
        // Calculate SOL received
        let sol_received = (self.virtual_sol_reserves as u128).checked_sub(
            new_virtual_sol_reserves
        )?;
        // Safely convert to u64
        let recv = sol_received.try_into().ok()?;
        Some(recv)
    }

    // New helper function for the "last buy" scenario
    pub fn get_sol_for_exact_tokens(&self, token_amount: u64) -> Option<u64> {
        if token_amount == 0 {
            return None;
        }

        // Use the same calculation as get_sol_for_sell_tokens but with a twist:
        // Instead of adding tokens, we're removing them (the inverse operation of buying)
        // This tells us how much SOL is needed to buy exactly these tokens

        // Calculate constant k = virtual_sol * virtual_token
        let k = (self.virtual_sol_reserves as u128).checked_mul(
            self.virtual_token_reserves as u128
        )?;

        // Calculate new virtual token reserves after removing tokens
        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_sub(
            token_amount as u128
        )?;

        // Calculate new virtual SOL reserves: k / new_token_reserves
        let new_virtual_sol_reserves = k.checked_div(new_virtual_token_reserves)?;

        // Calculate SOL needed (difference between new and current SOL reserves)
        let sol_needed = new_virtual_sol_reserves.checked_sub(self.virtual_sol_reserves as u128)?;
        // Safely convert to u64
        sol_needed.try_into().ok()
    }
}
