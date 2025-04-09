use std::fmt;

use anchor_lang::prelude::*;

use crate::{ errors::ContractError, Global };

use super::BondingCurveLockerCtx;

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
    pub initial_virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub token_total_supply: u64,
    pub start_time: i64,
    pub complete: bool,
    pub bump: u8,
    pub sol_raise_target: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateBondingCurveParams {
    // Token metadata
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub start_time: Option<i64>,
    pub sol_raise_target: u64,
    // DaoProposal Metadat
    pub dao_name: String,
    pub dao_description: String,
    pub realm_address: Pubkey,
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

    pub fn calculate_fee(&self, amount: u64, time_now: i64) -> Result<u64> {
        let start_time = self.start_time;

        msg!("Start time: {}", start_time);
        msg!("Current time: {}", time_now);

        let time_diff = time_now - start_time;
        let slots_passed = time_diff / 400;
        msg!("Time diff: {} ms ({} slots)", time_diff, slots_passed);

        let mut sol_fee: u64 = 0;

        if slots_passed < 150 {
            msg!("Phase 1: 99% fees between slot 0 - 150");
            sol_fee = bps_mul(9900, amount, 10_000).unwrap();
        } else if slots_passed >= 150 && slots_passed <= 250 {
            msg!("Phase 2: Linear decrease between 150 - 250");

            // Calculate the minimum fee bps (at slot 250) scaled by 10000 for precision
            let fee_bps = (-8_300_000_i64)
                .checked_mul(slots_passed)
                .ok_or(ContractError::ArithmeticError)?
                .checked_add(2_162_600_000)
                .ok_or(ContractError::ArithmeticError)?
                .checked_div(1_000_000)
                .ok_or(ContractError::ArithmeticError)?;
            msg!("Fee Bps: {}", fee_bps);

            sol_fee = bps_mul(fee_bps as u64, amount, 10_000).unwrap();
        } else if slots_passed > 250 {
            msg!("Phase 3: 1% fees after 250");
            sol_fee = bps_mul(100, amount, 10_000).unwrap();
        }
        Ok(sol_fee)
    }

    pub fn get_signer<'a>(bump: &'a u8, mint: &'a Pubkey) -> [&'a [u8]; 3] {
        [Self::SEED_PREFIX.as_bytes(), mint.as_ref(), std::slice::from_ref(bump)]
    }

    pub fn is_started(&self, clock: &Clock) -> bool {
        let now = clock.unix_timestamp;
        now >= self.start_time
    }

    pub fn msg(&self) -> () {
        msg!("{:#?}", self);
    }

    pub fn update_from_params(
        &mut self,
        mint: Pubkey,
        creator: Pubkey,
        global_config: &Global,
        params: &CreateBondingCurveParams,
        clock: &Clock,
        bump: u8
    ) -> &mut Self {
        let start_time = if let Some(start_time) = params.start_time {
            start_time
        } else {
            clock.unix_timestamp
        };
        let creator = creator;
        let complete = false;

        let sol_raise_target = params.sol_raise_target;

        // but only 50% is actually tradable
        self.clone_from(
            &(BondingCurve {
                mint,
                creator,
                // Use FULL token supply for virtual reserves to accurately represent price
                virtual_token_reserves: global_config.token_total_supply, // 100M tokens
                virtual_sol_reserves: global_config.initial_virtual_sol_reserves,
                initial_virtual_token_reserves: global_config.token_total_supply,
                real_sol_reserves: 0,
                // Only 50% of tokens available for trading
                real_token_reserves: global_config.initial_real_token_reserves, // 50M tokens
                token_total_supply: global_config.token_total_supply,
                start_time,
                complete,
                bump,
                sol_raise_target,
            })
        );
        self
    }

    pub fn apply_buy(&mut self, mut sol_amount: u64) -> Option<BuyResult> {
        msg!("Applying buy: {}", sol_amount);
        // Check if we're reaching or exceeding the SOL raise target
        if self.sol_raise_target > 0 {
            let potential_new_sol_reserves = self.real_sol_reserves.checked_add(sol_amount)?;
            if potential_new_sol_reserves >= self.sol_raise_target {
                msg!("SOL raise target of {} reached or exceeded.", self.sol_raise_target);
                // Mark as complete (will trigger migration path later)
                // But don't adjust the amount - let the user buy as much as they want
                self.complete = true;
            }
        }

        let mut token_amount = self.get_tokens_for_buy_sol(sol_amount)?;
        msg!("Token amount: {:?}", token_amount);

        // Check if this purchase would exceed the token reserves
        if token_amount >= self.real_token_reserves {
            // Last Buy - just buy all remaining tokens
            token_amount = self.real_token_reserves;

            // Calculate SOL amount needed using the bonding curve formula
            // This ensures pricing is consistent with the curve
            sol_amount = self.get_sol_for_exact_tokens(token_amount)?;

            // Mark the curve as complete

            self.complete = true;

            msg!("ApplyBuy: Last buy - all tokens purchased. SOL amount: {}", sol_amount);
        }

        // Adjusting token reserve values
        // New Virtual Token Reserves
        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_sub(
            token_amount as u128
        )?;
        msg!("ApplyBuy: new_virtual_token_reserves: {}", new_virtual_token_reserves);

        // New Real Token Reserves
        let new_real_token_reserves = (self.real_token_reserves as u128).checked_sub(
            token_amount as u128
        )?;
        msg!("ApplyBuy: new_real_token_reserves: {}", new_real_token_reserves);

        // Adjusting sol reserve values
        // New Virtual Sol Reserves
        let new_virtual_sol_reserves = (self.virtual_sol_reserves as u128).checked_add(
            sol_amount as u128
        )?;
        msg!("ApplyBuy: new_virtual_sol_reserves: {}", new_virtual_sol_reserves);

        // New Real Sol Reserves
        let new_real_sol_reserves = (self.real_sol_reserves as u128).checked_add(
            sol_amount as u128
        )?;
        msg!("ApplyBuy: new_real_sol_reserves: {}", new_real_sol_reserves);

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
        self.msg();
        Some(BuyResult {
            token_amount,
            sol_amount,
            price_per_token,
        })
    }

    pub fn apply_sell(&mut self, token_amount: u64) -> Option<SellResult> {
        msg!("apply_sell: token_amount: {}", token_amount);

        // Computing Sol Amount out
        let sol_amount = self.get_sol_for_sell_tokens(token_amount)?;
        msg!("apply_sell: sol_amount: {}", sol_amount);

        // Check if bonding curve has enough SOL to fulfill the sell request
        if sol_amount > self.real_sol_reserves {
            msg!("apply_sell: Not enough SOL reserves to fulfill sell request");
            return None;
        }

        // Adjusting token reserve values
        // New Virtual Token Reserves
        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_add(
            token_amount as u128
        )?;
        msg!("apply_sell: new_virtual_token_reserves: {}", new_virtual_token_reserves);

        // New Real Token Reserves
        let new_real_token_reserves = (self.real_token_reserves as u128).checked_add(
            token_amount as u128
        )?;
        msg!("apply_sell: new_real_token_reserves: {}", new_real_token_reserves);

        // Adjusting sol reserve values
        // New Virtual Sol Reserves
        let new_virtual_sol_reserves = (self.virtual_sol_reserves as u128).checked_sub(
            sol_amount as u128
        )?;
        msg!("apply_sell: new_virtual_sol_reserves: {}", new_virtual_sol_reserves);

        // New Real Sol Reserves
        let new_real_sol_reserves = self.real_sol_reserves.checked_sub(sol_amount)?;
        msg!("apply_sell: new_real_sol_reserves: {}", new_real_sol_reserves);

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

        msg!("apply_sell: updated state successfully");
        self.msg();

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
        msg!("GetTokensForBuySol: sol_amount: {}", sol_amount);

        // Calculate constant k = virtual_sol * virtual_token
        let k = (self.virtual_sol_reserves as u128).checked_mul(
            self.virtual_token_reserves as u128
        )?;
        msg!("GetTokensForBuySol: constant k: {}", k);

        // Calculate new virtual SOL reserves after adding input SOL
        let new_virtual_sol_reserves = (self.virtual_sol_reserves as u128).checked_add(
            sol_amount as u128
        )?;
        msg!("GetTokensForBuySol: new_virtual_sol_reserves: {}", new_virtual_sol_reserves);

        // Calculate new virtual token reserves: k / new_sol_reserves
        let new_virtual_token_reserves = k.checked_div(new_virtual_sol_reserves)?;
        msg!("GetTokensForBuySol: new_virtual_token_reserves: {}", new_virtual_token_reserves);

        // Calculate tokens received
        let tokens_received = (self.virtual_token_reserves as u128).checked_sub(
            new_virtual_token_reserves
        )?;
        msg!("GetTokensForBuySol: tokens_received: {}", tokens_received);

        // Safely convert to u64
        let recv = tokens_received.try_into().ok()?;
        msg!("GetTokensForBuySol: recv: {}", recv);
        Some(recv)
    }

    pub fn get_sol_for_sell_tokens(&self, token_amount: u64) -> Option<u64> {
        if token_amount == 0 {
            return None;
        }
        msg!("GetSolForSellTokens: token_amount: {}", token_amount);

        // Calculate constant k = virtual_sol * virtual_token
        let k = (self.virtual_sol_reserves as u128).checked_mul(
            self.virtual_token_reserves as u128
        )?;
        msg!("GetSolForSellTokens: constant k: {}", k);

        // Calculate new virtual token reserves after adding input tokens
        let new_virtual_token_reserves = (self.virtual_token_reserves as u128).checked_add(
            token_amount as u128
        )?;
        msg!("GetSolForSellTokens: new_virtual_token_reserves: {}", new_virtual_token_reserves);

        // Calculate new virtual SOL reserves: k / new_token_reserves
        let new_virtual_sol_reserves = k.checked_div(new_virtual_token_reserves)?;
        msg!("GetSolForSellTokens: new_virtual_sol_reserves: {}", new_virtual_sol_reserves);

        // Calculate SOL received
        let sol_received = (self.virtual_sol_reserves as u128).checked_sub(
            new_virtual_sol_reserves
        )?;
        msg!("GetSolForSellTokens: sol_received: {}", sol_received);

        // Safely convert to u64
        let recv = sol_received.try_into().ok()?;
        msg!("GetSolForSellTokens: recv: {}", recv);
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

    pub fn invariant(ctx: &mut BondingCurveLockerCtx) -> Result<()> {
        let bonding_curve = &mut ctx.bonding_curve;
        let tkn_account = &mut ctx.bonding_curve_token_account;
        if tkn_account.owner != bonding_curve.key() {
            msg!(
                "Token account authority is not the bonding curve: expected {} but got {}",
                bonding_curve.key(),
                tkn_account.owner
            );
            return Err(ContractError::BondingCurveInvariant.into());
        }

        tkn_account.reload()?;
        let lamports: u64 = bonding_curve.get_lamports();
        let mut tkn_amount = tkn_account.amount;
        if tkn_amount + ctx.global.initial_real_token_reserves >= ctx.global.token_total_supply {
            tkn_amount = tkn_amount
                .checked_add(ctx.global.initial_real_token_reserves)
                .ok_or(ContractError::ArithmeticError)?
                .checked_sub(ctx.global.token_total_supply)
                .ok_or(ContractError::ArithmeticError)?;
        }
        let rent_exemption_balance: u64 = Rent::get()?.minimum_balance(
            8 + (BondingCurve::INIT_SPACE as usize)
        );
        let bonding_curve_pool_lamports: u64 = lamports - rent_exemption_balance;
        // Ensure real sol reserves are equal to bonding curve pool lamports
        if bonding_curve_pool_lamports != bonding_curve.real_sol_reserves {
            msg!(
                "real_sol_r:{}, bonding_lamps:{}",
                bonding_curve.real_sol_reserves,
                bonding_curve_pool_lamports
            );
            msg!("Invariant failed: real_sol_reserves != bonding_curve_pool_lamports");
            return Err(ContractError::BondingCurveInvariant.into());
        }

        // Ensure the virtual reserves are always positive
        if bonding_curve.virtual_sol_reserves <= 0 {
            msg!("Invariant failed: virtual_sol_reserves <= 0");
            return Err(ContractError::BondingCurveInvariant.into());
        }
        if bonding_curve.virtual_token_reserves <= 0 {
            msg!("Invariant failed: virtual_token_reserves <= 0");
            return Err(ContractError::BondingCurveInvariant.into());
        }

        // Ensure the token total supply is consistent with the reserves
        if bonding_curve.real_token_reserves != tkn_amount {
            msg!("Invariant failed: real_token_reserves != tkn_amount");
            msg!("real_token_reserves: {}", bonding_curve.real_token_reserves);
            msg!("real_token_reserves: {}", bonding_curve.token_total_supply);
            msg!("tkn_amount: {}", tkn_amount);
            return Err(ContractError::BondingCurveInvariant.into());
        }
        Ok(())
    }
}

impl fmt::Display for BondingCurve {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "BondingCurve {{ creator: {:?}, initial_virtual_token_reserves: {:?}, virtual_sol_reserves: {:?}, virtual_token_reserves: {:?}, real_sol_reserves: {:?}, real_token_reserves: {:?}, token_total_supply: {:?}, start_time: {:?}, complete: {:?} }}",
            self.creator,
            self.initial_virtual_token_reserves,
            self.virtual_sol_reserves,
            self.virtual_token_reserves,
            self.real_sol_reserves,
            self.real_token_reserves,
            self.token_total_supply,
            self.start_time,
            self.complete
        )
    }
}
