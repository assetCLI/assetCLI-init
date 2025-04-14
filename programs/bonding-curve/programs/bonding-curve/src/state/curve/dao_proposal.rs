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
    #[max_len(200)]
    pub description: String,
    pub realm_address: Pubkey, // Treasury where funds are sent after fundraising

    // Optional social/community links
    #[max_len(50)]
    pub twitter_handle: Option<String>,
    #[max_len(100)]
    pub discord_link: Option<String>,
    #[max_len(100)]
    pub website_url: Option<String>,
    #[max_len(200)]
    pub logo_uri: Option<String>,

    // Team information
    #[max_len(50)]
    pub founder_name: Option<String>,
    #[max_len(50)]
    pub founder_twitter: Option<String>,

    // Investment thesis
    #[max_len(500)]
    pub bullish_thesis: Option<String>,

    // Governance parameters
    pub bump: u8,
}
impl DAOProposal {
    pub const SEED_PREFIX: &'static str = "dao_proposal";
    pub fn get_signer_seeds(&self) -> [&[u8];3] {
        let prefix_bytes = Self::SEED_PREFIX.as_bytes();
        let mint_bytes = self.mint.as_ref();
        let bump_slice = std::slice::from_ref(&self.bump);
        [prefix_bytes, mint_bytes, bump_slice]
    }
}
