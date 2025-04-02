import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResource(server: McpServer) {
  // README resource for assetCLI
  server.resource(
    "assetCLIReadme",
    new ResourceTemplate("assetCLI://docs/readme", { list: undefined }),
    async (uri) => {
      const readmeContent = `# assetCLI
  
  ## Overview
  assetCLI is a command-line interface tool for creating and managing DAOs (Decentralized Autonomous Organizations) on the Solana blockchain. It provides a streamlined experience for creating DAOs, managing proposals, executing treasury operations, and more.
  
  ## Features
  - Create integrated or standard DAOs
  - Manage DAO wallets and configurations
  - Create, vote on, and execute proposals
  - Fund and manage DAO treasuries
  - Transfer assets from DAO treasuries
  - Query account information and transactions
  - Create and manage standalone multisigs
  
  ## Getting Started
  1. Set your cluster with \`setCluster\` (devnet, testnet, or mainnet)
  2. Import or create a wallet with \`importWallet\`
  3. Create a DAO with \`createDao\` or use an existing one with \`useDao\`
  4. Alternatively, work with a standalone multisig using \`setMultisigAddress\`
  
  ## Usage Examples
  - Create a new DAO: \`createDao\`
  - List available DAOs: \`listDaos\`
  - Create a transfer proposal: \`transferProposal\`
  - Vote on a proposal: \`voteProposal\`
  - Execute a proposal: \`executeProposal\`
  - Work with standalone multisig: \`setMultisigAddress\` and \`multisigInfo\`
  
  ## Need Help?
  Type \`available-commands\` for a list of all available commands, or ask specific questions about any functionality.`;

      return {
        contents: [
          {
            uri: uri.href,
            text: readmeContent,
          },
        ],
      };
    }
  );

  // Add a new standalone multisig documentation resource
  server.resource(
    "multisigDocumentation",
    new ResourceTemplate("assetCLI://docs/multisig-guide", { list: undefined }),
    async (uri) => {
      const content = `# Standalone Multisig Management Guide
  
  ## Standalone Multisig
  A standalone Squads multisig is a multisignature wallet that's separate from any DAO, allowing multiple parties to control assets together.
  
  ## Working with Standalone Multisigs
  
  ### Setting a Multisig
  Use \`setMultisigAddress\` to configure an existing multisig address:
  - \`address\`: The public key of the multisig account
  
  ### Getting Multisig Information
  Use \`multisigInfo\` to view details about the configured multisig, including:
  - Vault address and balance
  - Members and threshold
  - Current transaction index
  
  ### Creating Transactions
  Use \`createMultisigTransaction\` to create SOL transfer transactions:
  - \`recipient\`: Recipient address
  - \`amount\`: Amount of SOL to transfer
  - \`title\`: Optional transaction title
  
  ### Approving and Executing Transactions
  - \`approveMultisigTransaction\`: Approve a transaction by its index number
  - \`executeMultisigTransaction\`: Execute an approved transaction that meets threshold`;

      return {
        contents: [
          {
            uri: uri.href,
            text: content,
          },
        ],
      };
    }
  );

  // DAO Documentation Resource
  server.resource(
    "daoDocumentation",
    new ResourceTemplate("assetCLI://docs/dao-guide", { list: undefined }),
    async (uri) => {
      const content = `# DAO Management Guide
  
  ## DAO Types
  - **Standard DAO**: A traditional DAO with on-chain governance
  - **Integrated DAO**: A DAO with integrated Squads multisig for improved treasury management
  
  ## Creating a DAO
  Use the \`createDao\` command with the following parameters:
  - \`integrated\`: Boolean indicating whether to create an integrated DAO
  - \`name\`: The name of your DAO
  - \`members\`: Array of member public keys
  - \`threshold\`: Number of signatures required for approval
  
  ## Managing a DAO
  - \`useDao\`: Set an existing DAO as active
  - \`showDao\`: Show information about the current DAO
  - \`listDaos\`: List all DAOs where you are a member
  - \`fundSolana\`: Fund the DAO treasury with SOL
  - \`fundToken\`: Fund the DAO treasury with tokens`;

      return {
        contents: [
          {
            uri: uri.href,
            text: content,
          },
        ],
      };
    }
  );

  // Proposal Documentation Resource
  server.resource(
    "proposalDocumentation",
    new ResourceTemplate("assetCLI://docs/proposal-guide", { list: undefined }),
    async (uri) => {
      const content = `# Proposal Management Guide
  
  ## Creating Proposals
  Use \`transferProposal\` to create a proposal for transferring assets from the DAO treasury.
  
  Parameters:
  - \`name\`: Name of the proposal
  - \`description\`: Description of the proposal
  - \`amount\`: Amount to transfer
  - \`mint\`: (Optional) Token mint address for token transfers
  - \`recipient\`: Recipient address
  
  ## Voting on Proposals
  Use \`voteProposal\` to vote on an existing proposal.
  
  Parameters:
  - \`proposal\`: Address of the proposal
  - \`approve\`: Boolean indicating approval or rejection
  
  ## Executing Proposals
  Once a proposal has passed voting, use \`executeProposal\` to execute it.
  
  Parameters:
  - \`proposal\`: Address of the proposal
  
  ## Listing Proposals
  Use \`listProposals\` to see all proposals for the current DAO.
  
  Parameters:
  - \`showAll\`: Whether to show completed/cancelled proposals
  - \`limit\`: Maximum number of proposals to show`;

      return {
        contents: [
          {
            uri: uri.href,
            text: content,
          },
        ],
      };
    }
  );

  // Wallet Documentation Resource
  server.resource(
    "walletDocumentation",
    new ResourceTemplate("assetCLI://docs/wallet-guide", { list: undefined }),
    async (uri) => {
      const content = `# Wallet Management Guide
  
  ## Setting Up a Wallet
  Use \`importWallet\` to import an existing wallet. The parameter can be:
  - A path to a keypair file
  - A Base64 encoded private key
  
  ## Viewing Wallet Info
  Use \`showWallet\` to display information about the current wallet, including:
  - Public key
  - Balance
  - Other relevant data
  
  ## Wallet Configuration
  Your wallet is stored in the config and will be used for all operations that require signing.`;

      return {
        contents: [
          {
            uri: uri.href,
            text: content,
          },
        ],
      };
    }
  );
}
