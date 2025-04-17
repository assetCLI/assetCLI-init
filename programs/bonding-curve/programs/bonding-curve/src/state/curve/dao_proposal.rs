use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Debug, Default)]
pub struct DAOProposal {
    // Core DAO & mint information
    pub mint: Pubkey,
    pub creator: Pubkey,

    // Basic DAO metadata
    #[max_len(50)]
    pub name: String,
    #[max_len(256)]
    pub description: String,
    pub realm_address: Pubkey,
    pub treasury_address: Pubkey, // Treasury where funds are sent after fundraising
    pub governance_address: Pubkey, // Governance address for the DAO

    // Optional social/community links
    #[max_len(32)]
    pub twitter_handle: Option<String>,
    #[max_len(64)]
    pub discord_link: Option<String>,
    #[max_len(64)]
    pub website_url: Option<String>,
    #[max_len(256)]
    pub logo_uri: Option<String>,

    // Team information
    #[max_len(32)]
    pub founder_name: Option<String>,
    #[max_len(32)]
    pub founder_twitter: Option<String>,

    // Investment thesis
    #[max_len(256)]
    pub bullish_thesis: Option<String>,

    // Governance parameters
    pub bump: u8,
}
impl DAOProposal {
    pub const SEED_PREFIX: &'static str = "dao_proposal";
}
