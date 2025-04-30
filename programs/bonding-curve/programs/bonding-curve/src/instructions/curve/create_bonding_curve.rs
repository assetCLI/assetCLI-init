use anchor_lang::{ prelude::*, solana_program::{ program::invoke, system_instruction } };
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_metadata_accounts_v3,
        mpl_token_metadata::types::DataV2,
        CreateMetadataAccountsV3,
        Metadata,
    },
    token_interface::{ Mint, TokenAccount, TokenInterface, mint_to, MintTo },
};

use crate::{
    errors::ContractError,
    BondingCurve,
    CreateBondingCurveParams,
    Global,
    ProgramStatus,
    Proposal,
    
};

#[derive(Accounts)]
#[instruction(params: CreateBondingCurveParams)]
pub struct CreateBondingCurve<'info> {
    #[account(
        init,
        payer = creator,
        mint::decimals = params.token_decimals,
        mint::authority = bonding_curve,
        seeds = [
            BondingCurve::TOKEN_PREFIX.as_bytes(),
            params.name.as_bytes(),
            creator.key().as_ref(),
        ],
        bump
    )]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        constraint = base_mint.decimals == params.base_decimals @ ContractError::InvalidBaseMint,
    )]
    pub base_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [BondingCurve::SEED_PREFIX.as_bytes(), token_mint.to_account_info().key.as_ref()],
        bump,
        space = 8 + BondingCurve::INIT_SPACE
    )]
    pub bonding_curve: Box<Account<'info, BondingCurve>>,

    #[account(
        mut,
        seeds = [BondingCurve::VAULT_PREFIX.as_bytes(), token_mint.key().as_ref()],
        bump,
    )]
    pub bonding_curve_vault: SystemAccount<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [Proposal::SEED_PREFIX.as_bytes(), token_mint.key().as_ref()],
        bump,
        space = 8 + Proposal::INIT_SPACE
    )]
    pub proposal: Box<Account<'info, Proposal>>,

    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = token_mint,
        associated_token::authority = bonding_curve_vault
    )]
    bonding_curve_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        seeds = [Global::SEED_PREFIX.as_bytes()],
        constraint = global.initialized == true @ ContractError::NotInitialized,
        constraint = global.status == ProgramStatus::Running @ ContractError::ProgramNotRunning,
        bump,
    )]
    global: Box<Account<'info, Global>>,

    #[account(
        mut,
        seeds = [
            b"metadata",
            token_metadata_program.key().as_ref(),
            token_mint.key().as_ref()
        ],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    ///CHECK: Using seed to validate metadata account
    metadata: UncheckedAccount<'info>,

    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> CreateBondingCurve<'info> {
    pub fn process(
        &mut self,
        params: CreateBondingCurveParams,
        bumps: &CreateBondingCurveBumps
    ) -> Result<()> {
        let clock = Clock::get()?;

        // Initialize the Proposal
        self.initialize_proposal(&params, bumps.proposal)?;

        // Then update the bonding curve
        self.bonding_curve.update_from_params(
            self.token_mint.key(),
            self.base_mint.key(),
            self.creator.key(),
            &params,
            &clock,
            bumps.bonding_curve,
            bumps.bonding_curve_vault
        );

        // Initialize metadata and mint tokens
        self.initialize_meta(&params)?;

        let mint_authority_seeds = self.bonding_curve.get_signer_seeds();
        let mint_auth_signer_seeds: &[&[&[u8]]] = &[&mint_authority_seeds];
        mint_to(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                MintTo {
                    authority: self.bonding_curve.to_account_info(),
                    to: self.bonding_curve_token_account.to_account_info(),
                    mint: self.token_mint.to_account_info(),
                },
                mint_auth_signer_seeds
            ),
            self.bonding_curve.token_total_supply
        )?;
        self.init_bonding_curve_vault()?;
        Ok(())
    }

    fn initialize_proposal(
        &mut self,
        params: &CreateBondingCurveParams,
        dao_proposal_bump: u8
    ) -> Result<()> {
        // Initialize proposal with provided parameters
        self.proposal.set_inner(Proposal {
            mint: self.token_mint.key(),
            creator: *self.creator.key,
            name: params.name.clone(),
            description: params.description.clone(),
            twitter_handle: params.twitter_handle.clone(),
            treasury_address: params.treasury_address.clone(),
            discord_link: params.discord_link.clone(),
            website_url: params.website_url.clone(),
            authority_address: params.authority_address.clone(),
            logo_uri: params.logo_uri.clone(),
            founder_name: params.founder_name.clone(),
            founder_twitter: params.founder_twitter.clone(),
            bullish_thesis: params.bullish_thesis.clone(),
            bump: dao_proposal_bump,
        });
        Ok(())
    }

    fn initialize_meta(&mut self, params: &CreateBondingCurveParams) -> Result<()> {
        let mint_info = self.token_mint.to_account_info();
        let metadata_info = self.metadata.to_account_info();
        let mint_authority_info = self.bonding_curve.to_account_info();
        let mint_auth_signer_seeds = self.bonding_curve.get_signer_seeds();
        let mint_auth_signer = &[&mint_auth_signer_seeds[..]];

        let token_data: DataV2 = DataV2 {
            name: params.name.clone(),
            symbol: params.symbol.clone(),
            uri: params.uri.clone(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        let metadata_ctx = CpiContext::new_with_signer(
            self.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                payer: self.creator.to_account_info(),
                mint: mint_info.clone(),
                metadata: metadata_info.clone(),
                update_authority: mint_authority_info.clone(),
                mint_authority: mint_authority_info.clone(),
                system_program: self.system_program.to_account_info(),
                rent: self.rent.to_account_info(),
            },
            mint_auth_signer
        );

        create_metadata_accounts_v3(metadata_ctx, token_data, false, true, None)?;
        Ok(())
    }

    fn init_bonding_curve_vault(&self) -> Result<()> {
        let rent_exempt = Rent::get()?.minimum_balance(0);
        let transfer_ix = system_instruction::transfer(
            self.creator.to_account_info().key,
            self.bonding_curve_vault.to_account_info().key,
            rent_exempt
        );
        invoke(
            &transfer_ix,
            &[
                self.creator.to_account_info(),
                self.bonding_curve_vault.to_account_info(),
                self.system_program.to_account_info(),
            ]
        )?;
        Ok(())
    }
}
