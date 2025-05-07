use anchor_lang::prelude::*;

use crate::DEFAULT_SUPPLY;
pub fn bps_mul(bps: u64, value: u64, divisor: u64) -> Option<u64> {
    bps_mul_raw(bps, value, divisor).unwrap().try_into().ok()
}

pub fn bps_mul_raw(bps: u64, value: u64, divisor: u64) -> Option<u128> {
    (value as u128).checked_mul(bps as u128)?.checked_div(divisor as u128)
}

#[account]
#[derive(InitSpace, Debug, Default)]
pub struct BondingCurve {
    pub token_mint: Pubkey,
    pub base_mint: Pubkey,
    pub creator: Pubkey,
    pub virtual_base_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_base_reserves: u64,
    pub real_token_reserves: u64,
    pub token_total_supply: u64,
    pub start_time: i64,
    pub complete: bool,
    pub token_decimals: u8,
    pub base_decimals: u8,
    pub base_raise_target: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateBondingCurveParams {
    // Token metadata
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub base_raise_target: u64,
    pub token_decimals: u8,
    pub base_decimals: u8,
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
    /// Amount of base token that the user paid
    pub base_amount: u64,
    /// Price per token in base token
    pub price_per_token: f64,
    /// Fee taken in base token
    pub fee_amount: u64,
}

#[derive(Debug, Clone)]
pub struct SellResult {
    /// Amount of tokens that the user is selling
    pub token_amount: u64,
    /// Amount of base token that the user will receive
    pub base_amount: u64,
    /// Price per token in base token
    pub price_per_token: f64,
    /// Fee taken in base token
    pub fee_amount: u64,
}

impl BondingCurve {
    pub const SEED_PREFIX: &'static str = "bonding_curve";
    pub const TOKEN_PREFIX: &'static str = "bonding_curve_token";
    pub const VAULT_PREFIX: &'static str = "bonding_curve_vault";

    pub fn get_fee_bps(&self, time_now: i64) -> u64 {
        // Decay from 10% to 1% over 7 days (in seconds)
        let decay_period = 7 * 24 * 60 * 60; // 7 days in seconds
        let start_fee = 1000u64; // 10%
        let min_fee = 100u64; // 1%
        let elapsed = time_now.saturating_sub(self.start_time);
        if elapsed >= decay_period {
            min_fee
        } else {
            let decay =
                ((start_fee - min_fee) as u64).saturating_mul(elapsed as u64) /
                (decay_period as u64);
            start_fee - decay
        }
    }

    pub fn calculate_fee(&self, amount: u64, time_now: i64) -> Result<u64> {
        let fee_bps = self.get_fee_bps(time_now);
        let fee = (amount as u128)
            .checked_mul(fee_bps as u128)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(ProgramError::ArithmeticOverflow)?;
        Ok(fee as u64)
    }

    pub fn get_signer_seeds(&self) -> [&[u8]; 3] {
        [Self::SEED_PREFIX.as_bytes(), self.token_mint.as_ref(), std::slice::from_ref(&self.bump)]
    }

    pub fn get_vault_seeds(&self) -> [&[u8]; 3] {
        [
            Self::VAULT_PREFIX.as_bytes(),
            self.token_mint.as_ref(),
            std::slice::from_ref(&self.vault_bump),
        ]
    }

    pub fn is_started(&self, clock: &Clock) -> bool {
        let now = clock.unix_timestamp;
        now >= self.start_time
    }

    pub fn update_from_params(
        &mut self,
        token_mint: Pubkey,
        base_mint: Pubkey,
        creator: Pubkey,
        params: &CreateBondingCurveParams,
        clock: &Clock,
        bump: u8,
        vault_bump: u8
    ) -> &mut Self {
        let start_time = clock.unix_timestamp;
        let creator = creator;
        let complete = false;

        let base_raise_target: u64 = params.base_raise_target;
        let token_total_supply = params.token_total_supply.unwrap_or(DEFAULT_SUPPLY);
        let virtual_token_reserves = token_total_supply;
        let real_token_reserves = virtual_token_reserves / 2; // 50% of the total supply
        self.clone_from(
            &(BondingCurve {
                token_mint: token_mint,
                creator,
                virtual_token_reserves,
                virtual_base_reserves: params.base_raise_target,
                real_base_reserves: 0,
                real_token_reserves,
                token_total_supply,
                base_mint,
                token_decimals: params.token_decimals,
                base_decimals: params.base_decimals,
                start_time,
                complete,
                bump,
                base_raise_target,
                vault_bump,
            })
        );
        self
    }

    pub fn apply_buy(&mut self, base_amount: u64, time_now: i64) -> Option<BuyResult> {
        // Calculate fee and net base amount
        let fee_amount = self.calculate_fee(base_amount, time_now).ok()?;
        let mut net_base_amount: u64 = base_amount.checked_sub(fee_amount)?;

        // Check if we're reaching or exceeding the base raise target
        if self.base_raise_target > 0 {
            let potential_new_base_reserves = self.real_base_reserves.checked_add(net_base_amount)?;
            if potential_new_base_reserves >= self.base_raise_target {
                // Mark as complete (will trigger migration path later)
                self.complete = true;
            }
        }

        // Use net_base_amount for all reserve math
        let mut token_amount = self.get_tokens_for_buy_base(net_base_amount)?;

        // Check if this purchase would exceed the token reserves
        if token_amount >= self.real_token_reserves {
            // Last Buy - just buy all remaining tokens
            token_amount = self.real_token_reserves;
            // Calculate base amount needed using the bonding curve formula
            // This ensures pricing is consistent with the curve
            net_base_amount = self.get_base_for_exact_tokens(token_amount)?;
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
        // Adjusting base reserve values
        // New Virtual base Reserves
        let new_virtual_base_reserves = (self.virtual_base_reserves as u128).checked_add(
            net_base_amount as u128
        )?;
        // New Real base Reserves
        let new_real_base_reserves = (self.real_base_reserves as u128).checked_add(
            net_base_amount as u128
        )?;
        // Calculate price per token
        let price_per_token = if token_amount > 0 {
            (net_base_amount as f64) / (token_amount as f64)
        } else {
            0.0
        };

        self.virtual_token_reserves = new_virtual_token_reserves.try_into().ok()?;
        self.real_token_reserves = new_real_token_reserves.try_into().ok()?;
        self.virtual_base_reserves = new_virtual_base_reserves.try_into().ok()?;
        self.real_base_reserves = new_real_base_reserves.try_into().ok()?;
        Some(BuyResult {
            token_amount,
            base_amount: net_base_amount,
            price_per_token,
            fee_amount,
        })
    }

    pub fn apply_sell(&mut self, token_amount: u64, time_now: i64) -> Option<SellResult> {
        let gross_base_amount = self.get_base_for_sell_tokens(token_amount)?;
        let fee_amount = self.calculate_fee(gross_base_amount, time_now).ok()?;
        let net_base_amount = gross_base_amount.checked_sub(fee_amount)?;
        if gross_base_amount > self.real_base_reserves {
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
        // Adjusting base reserve values
        // New Virtual base Reserves
        let new_virtual_base_reserves = (self.virtual_base_reserves as u128).checked_sub(
            gross_base_amount as u128
        )?;
        // New Real Base Reserves
        let new_real_base_reserves = (self.real_base_reserves as u128).checked_sub(gross_base_amount as u128)?;
        // Calculate price per token
        let price_per_token = if token_amount > 0 {
            (net_base_amount as f64) / (token_amount as f64)
        } else {
            0.0
        };

        self.virtual_token_reserves = new_virtual_token_reserves.try_into().ok()?;
        self.real_token_reserves = new_real_token_reserves.try_into().ok()?;
        self.virtual_base_reserves = new_virtual_base_reserves.try_into().ok()?;
        self.real_base_reserves = new_real_base_reserves.try_into().ok()?;
        Some(SellResult {
            token_amount,
            base_amount: net_base_amount,
            price_per_token,
            fee_amount,
        })
    }

    pub fn get_tokens_for_buy_base(&self, sol_amount: u64) -> Option<u64> {
        if sol_amount == 0 {
            return None;
        }
        // Calculate constant k = virtual_sol * virtual_token
        let k = (self.virtual_base_reserves as u128).checked_mul(
            self.virtual_token_reserves as u128
        )?;
        // Calculate new virtual SOL reserves after adding input SOL
        let new_virtual_base_reserves = (self.virtual_base_reserves as u128).checked_add(
            sol_amount as u128
        )?;
        // Calculate new virtual token reserves: k / new_sol_reserves
        let new_virtual_token_reserves = k.checked_div(new_virtual_base_reserves)?;
        // Calculate tokens received
        let tokens_received = (self.virtual_token_reserves as u128).checked_sub(
            new_virtual_token_reserves
        )?;
        // Safely convert to u64
        let recv = tokens_received.try_into().ok()?;
        Some(recv)
    }

    pub fn get_base_for_sell_tokens(&self, token_amount: u64) -> Option<u64> {
        if token_amount == 0 {
            return None;
        }
        // Calculate constant k = virtual_sol * virtual_token
        let k = (self.virtual_base_reserves as u128).checked_mul(
            self.virtual_token_reserves as u128
        )?;
        // Calculate new virtual token reserves after adding input tokens
        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_add(
            token_amount as u128
        )?;
        // Calculate new virtual SOL reserves: k / new_token_reserves
        let new_virtual_base_reserves = k.checked_div(new_virtual_token_reserves)?;
        // Calculate SOL received
        let base_recieved = (self.virtual_base_reserves as u128).checked_sub(
            new_virtual_base_reserves
        )?;
        // Safely convert to u64
        let recv = base_recieved.try_into().ok()?;
        Some(recv)
    }

    // New helper function for the "last buy" scenario
    pub fn get_base_for_exact_tokens(&self, token_amount: u64) -> Option<u64> {
        if token_amount == 0 {
            return None;
        }

        // Use the same calculation as get_base_for_sell_tokens but with a twist:
        // Instead of adding tokens, we're removing them (the inverse operation of buying)
        // This tells us how much base is needed to buy exactly these tokens

        // Calculate constant k = virtual_base * virtual_token
        let k = (self.virtual_base_reserves as u128).checked_mul(
            self.virtual_token_reserves as u128
        )?;

        // Calculate new virtual token reserves after removing tokens
        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_sub(
            token_amount as u128
        )?;

        // Calculate new virtual SOL reserves: k / new_token_reserves
        let new_virtual_base_reserves = k.checked_div(new_virtual_token_reserves)?;

        // Calculate SOL needed (difference between new and current SOL reserves)
        let base_needed = new_virtual_base_reserves.checked_sub(
            self.virtual_base_reserves as u128
        )?;
        // Safely convert to u64
        base_needed.try_into().ok()
    }
}
