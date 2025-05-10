// import { Command } from "commander";
// import chalk from "chalk";
// import { ConnectionService } from "../services/connection-service";
// import { WalletService } from "../services/wallet-service";
// import { ConfigService } from "../services/config-service";
// import {
//   PublicKey,
//   LAMPORTS_PER_SOL,
//   TransactionInstruction,
// } from "@solana/web3.js";
// import { ProposalService } from "../services/proposal-service";
// import { GovernanceService } from "../services/governance-service";
// import { ProposalV2 } from "governance-idl-sdk";

// export function registerProposalCommands(program: Command): void {
//   const proposalCommand = program
//     .command("proposal")
//     .description(
//       "Proposal management for both DAO governance and multisig operations"
//     )
//     .addHelpText(
//       "after",
//       `
// Integrated Workflow:
//   1. Create a proposal (transfer)
//   2. Vote on the proposal (automatically approves related multisig transaction)
//   3. Execute the proposal (automatically executes related multisig transaction if threshold is met)

// Examples:
//   $ assetCLI dao init --name "My DAO" --threshold 2 --members "pub1,pub2,pub3"
//   $ assetCLI dao fund --amount 0.2
//   $ assetCLI proposal transfer --amount 0.05 --recipient <ADDRESS> --mint <MINT_ADDRESS>
//   $ assetCLI proposal vote --proposal <ADDRESS>
//   $ assetCLI proposal execute --proposal <ADDRESS>
// `
//     );

//   proposalCommand
//     .command("transfer")
//     .description(
//       "Create a proposal to transfer SOL (automatically handles treasury or multisig transfers)"
//     )
//     .option("-n, --name <string>", "Name of the proposal", "Asset Transfer")
//     .option(
//       "-d, --description <string>",
//       "Description of the proposal",
//       "Transfer assets from DAO"
//     )
//     .option("-a, --amount <number>", "Amount of SOL/tokens to transfer", "0.1")
//     .option("-m, --mint <string>", "Token mint address (for token transfers)")
//     .option("-r, --recipient <string>", "Recipient wallet address")
//     .action(async (options) => {
//       try {
//         // Load wallet and connection
//         const walletRes = await WalletService.loadWallet();
//         if (!walletRes.success || !walletRes.data) {
//           console.log(
//             chalk.red("No wallet configured. Please create a wallet first.")
//           );
//           return;
//         }

//         // Check config
//         const configRes = await ConfigService.getConfig();
//         if (
//           !configRes.success ||
//           !configRes.data ||
//           !configRes.data.dao?.activeRealm
//         ) {
//           console.log(
//             chalk.yellow(
//               'No DAO configured. Use "dao use <ADDRESS>" to select one.'
//             )
//           );
//           return;
//         }

//         const connectionRes = await ConnectionService.getConnection();
//         if (!connectionRes.success || !connectionRes.data) {
//           console.log(chalk.red("Failed to establish connection"));
//           return;
//         }

//         const connection = connectionRes.data;
//         const keypair = WalletService.getKeypair(walletRes.data);
//         const realmAddress = new PublicKey(configRes.data.dao.activeRealm);

//         // Get DAO type (integrated or standard)
//         const realmInfoRes = await GovernanceService.getRealmInfo(
//           connection,
//           realmAddress
//         );
//         if (!realmInfoRes.success || !realmInfoRes.data) {
//           console.log(
//             chalk.red("Failed to get DAO information:"),
//             realmInfoRes.error?.message
//           );
//           return;
//         }
//         const realmInfo = realmInfoRes.data;
//         const isIntegrated = realmInfo.isIntegrated;

//         // Parse recipient
//         let recipientAddress: PublicKey;
//         if (options.recipient) {
//           try {
//             recipientAddress = new PublicKey(options.recipient);
//           } catch (e) {
//             console.log(chalk.red("Invalid recipient address."));
//             return;
//           }
//         } else {
//           // Use own address if no recipient provided
//           recipientAddress = keypair.publicKey;
//           console.log(
//             chalk.yellow(
//               `No recipient specified. Using your address: ${recipientAddress.toBase58()}`
//             )
//           );
//         }

//         // Parse amount
//         const amount = parseFloat(options.amount);
//         if (isNaN(amount) || amount <= 0) {
//           console.log(
//             chalk.red("Invalid amount. Please provide a positive number.")
//           );
//           return;
//         }

//         // Check balance of the source account
//         let sourceAddress: PublicKey;
//         let sourceBalance: number;

//         if (isIntegrated && realmInfo.vaultAddress) {
//           sourceAddress = realmInfo.vaultAddress;
//           sourceBalance = await connection.getBalance(sourceAddress);
//           console.log(
//             `Multisig vault balance: ${sourceBalance / LAMPORTS_PER_SOL} SOL`
//           );
//         } else {
//           sourceAddress = realmInfo.treasuryAddress;
//           sourceBalance = await connection.getBalance(sourceAddress);
//           console.log(
//             `Treasury balance: ${sourceBalance / LAMPORTS_PER_SOL} SOL`
//           );
//         }

//         if (sourceBalance < amount * LAMPORTS_PER_SOL) {
//           console.log(
//             chalk.yellow(
//               `\n⚠️ Warning: Source account doesn't have enough SOL to execute this transfer.`
//             )
//           );
//           console.log(
//             chalk.yellow(
//               `Balance: ${
//                 sourceBalance / LAMPORTS_PER_SOL
//               } SOL, transfer amount: ${amount} SOL`
//             )
//           );
//           console.log(
//             chalk.yellow(`Use 'dao fund' to fund the account first.`)
//           );
//           throw new Error(
//             "Treasury doesn't have enough SOL to execute this transfer."
//           );
//         }

//         console.log(chalk.blue("\nCreating transfer proposal:"));
//         console.log(`Name: ${options.name}`);
//         console.log(`Description: ${options.description}`);
//         console.log(`Amount: ${amount} SOL`);
//         console.log(`Recipient: ${recipientAddress.toBase58()}`);

//         // Build instructions based on DAO type and transfer type (SOL or Token)
//         let instructionsRes;
//         let proposalAddressRes;

//         if (options.mint) {
//           // Token transfer
//           const tokenMint = new PublicKey(options.mint);
//           console.log(`Token mint: ${tokenMint.toBase58()}`);

//           if (isIntegrated && realmInfo.multisigAddress) {
//             instructionsRes =
//               await ProposalService.getSquadsMultisigTokenTransferInstruction(
//                 connection,
//                 realmInfo.multisigAddress,
//                 tokenMint,
//                 amount,
//                 recipientAddress
//               );

//             if (!instructionsRes.success || !instructionsRes.data) {
//               console.log(
//                 chalk.red("Failed to create transfer instruction:"),
//                 instructionsRes.error?.message
//               );
//               return;
//             }

//             proposalAddressRes =
//               await ProposalService.createIntegratedAssetTransferProposal(
//                 connection,
//                 keypair,
//                 realmAddress,
//                 options.name,
//                 options.description,
//                 instructionsRes.data
//               );
//           } else {
//             instructionsRes = await ProposalService.getTokenTransferInstruction(
//               connection,
//               realmAddress,
//               tokenMint,
//               amount,
//               recipientAddress
//             );

//             if (!instructionsRes.success || !instructionsRes.data) {
//               console.log(
//                 chalk.red("Failed to create transfer instruction:"),
//                 instructionsRes.error?.message
//               );
//               return;
//             }

//             proposalAddressRes = await ProposalService.createProposal(
//               connection,
//               keypair,
//               realmAddress,
//               options.name,
//               options.description,
//               instructionsRes.data
//             );
//           }
//         } else {
//           // SOL transfer
//           if (isIntegrated && realmInfo.multisigAddress) {
//             // For integrated DAO, create a multisig transfer
//             const transferIxRes =
//               await ProposalService.getSquadsMultisigSolTransferInstruction(
//                 connection,
//                 realmInfo.multisigAddress,
//                 amount,
//                 recipientAddress
//               );

//             if (!transferIxRes.success || !transferIxRes.data) {
//               console.log(
//                 chalk.red("Failed to create transfer instruction:"),
//                 transferIxRes.error?.message
//               );
//               return;
//             }

//             proposalAddressRes =
//               await ProposalService.createIntegratedAssetTransferProposal(
//                 connection,
//                 keypair,
//                 realmAddress,
//                 options.name,
//                 options.description,
//                 [transferIxRes.data]
//               );
//           } else {
//             // For standard DAO, create a treasury transfer
//             const transferIxRes =
//               await ProposalService.getSolTransferInstruction(
//                 connection,
//                 realmAddress,
//                 amount,
//                 recipientAddress
//               );

//             if (!transferIxRes.success || !transferIxRes.data) {
//               console.log(
//                 chalk.red("Failed to create transfer instruction:"),
//                 transferIxRes.error?.message
//               );
//               return;
//             }

//             proposalAddressRes = await ProposalService.createProposal(
//               connection,
//               keypair,
//               realmAddress,
//               options.name,
//               options.description,
//               [transferIxRes.data]
//             );
//           }
//         }

//         if (!proposalAddressRes.success || !proposalAddressRes.data) {
//           console.log(
//             chalk.red("Failed to create proposal:"),
//             proposalAddressRes.error?.message
//           );
//           return;
//         }

//         const proposalAddress = proposalAddressRes.data;

//         console.log(chalk.green(`\n✅ Proposal created successfully!`));
//         console.log(
//           chalk.green(`Proposal address: ${proposalAddress.toBase58()}`)
//         );
//         console.log(chalk.blue("\nNext steps:"));
//         console.log(`1. Have members vote on the proposal:`);
//         console.log(
//           `   proposal vote --proposal ${proposalAddress.toBase58()}`
//         );
//         console.log(`2. Execute the proposal when approved:`);
//         console.log(
//           `   proposal execute --proposal ${proposalAddress.toBase58()}`
//         );
//       } catch (error) {
//         console.error(chalk.red("Failed to create proposal:"), error);
//       }
//     });

//   // Add vote command for proposals
//   proposalCommand
//     .command("vote")
//     .description("Vote on an existing proposal")
//     .option("-p, --proposal <string>", "Proposal address to vote on")
//     .option("-a, --approve", "Vote to approve the proposal", true)
//     .option("-d, --deny", "Vote to deny the proposal")
//     .action(async (options) => {
//       try {
//         // Load wallet and connection
//         const walletRes = await WalletService.loadWallet();
//         if (!walletRes.success || !walletRes.data) {
//           console.log(
//             chalk.red("No wallet configured. Please create a wallet first.")
//           );
//           return;
//         }

//         // Check config
//         const configRes = await ConfigService.getConfig();
//         if (
//           !configRes.success ||
//           !configRes.data ||
//           !configRes.data.dao?.activeRealm
//         ) {
//           console.log(
//             chalk.yellow('No DAO configured. Use "dao init" to create one.')
//           );
//           return;
//         }

//         if (!options.proposal) {
//           console.log(chalk.red("Proposal address is required."));
//           return;
//         }

//         const connectionRes = await ConnectionService.getConnection();
//         if (!connectionRes.success || !connectionRes.data) {
//           console.log(chalk.red("Failed to establish connection"));
//           return;
//         }

//         const connection = connectionRes.data;
//         const keypair = WalletService.getKeypair(walletRes.data);
//         const realmAddress = new PublicKey(configRes.data.dao.activeRealm);

//         // Parse proposal address
//         let proposalAddress: PublicKey;
//         try {
//           proposalAddress = new PublicKey(options.proposal);
//         } catch (e) {
//           console.log(chalk.red("Invalid proposal address."));
//           return;
//         }

//         // Determine vote (approve or deny)
//         const approve = !options.deny;

//         console.log(
//           chalk.blue(`Casting vote to ${approve ? "approve" : "deny"} proposal`)
//         );
//         console.log(`Proposal: ${proposalAddress.toBase58()}`);

//         // Cast vote
//         const voteRes = await ProposalService.castVote(
//           connection,
//           keypair,
//           realmAddress,
//           proposalAddress,
//           approve
//         );

//         if (!voteRes.success) {
//           console.log(
//             chalk.red("Failed to cast vote:"),
//             voteRes.error?.message
//           );
//           return;
//         }

//         console.log(chalk.green(`\n✅ Vote cast successfully!`));
//         console.log(chalk.blue(`Transaction: ${voteRes.data}`));
//       } catch (error) {
//         console.error(chalk.red("Failed to vote on proposal:"), error);
//       }
//     });

//   // Add execute command for proposals
//   proposalCommand
//     .command("execute")
//     .description("Execute an approved proposal")
//     .option("-p, --proposal <string>", "Proposal address to execute")
//     .action(async (options) => {
//       try {
//         // Load wallet and connection
//         const walletRes = await WalletService.loadWallet();
//         if (!walletRes.success || !walletRes.data) {
//           console.log(
//             chalk.red("No wallet configured. Please create a wallet first.")
//           );
//           return;
//         }

//         // Check config
//         const configRes = await ConfigService.getConfig();
//         if (
//           !configRes.success ||
//           !configRes.data ||
//           !configRes.data.dao?.activeRealm
//         ) {
//           console.log(
//             chalk.yellow('No DAO configured. Use "dao init" to create one.')
//           );
//           return;
//         }

//         if (!options.proposal) {
//           console.log(chalk.red("Proposal address is required."));
//           return;
//         }

//         const connectionRes = await ConnectionService.getConnection();
//         if (!connectionRes.success || !connectionRes.data) {
//           console.log(chalk.red("Failed to establish connection"));
//           return;
//         }

//         const connection = connectionRes.data;
//         const keypair = WalletService.getKeypair(walletRes.data);

//         // Parse proposal address
//         let proposalAddress: PublicKey;
//         try {
//           proposalAddress = new PublicKey(options.proposal);
//         } catch (e) {
//           console.log(chalk.red("Invalid proposal address."));
//           return;
//         }

//         console.log(
//           chalk.blue(`Executing proposal: ${proposalAddress.toBase58()}`)
//         );

//         // Execute the proposal
//         const executeRes = await ProposalService.executeProposal(
//           connection,
//           keypair,
//           proposalAddress
//         );

//         if (!executeRes.success) {
//           console.log(
//             chalk.red("Failed to execute proposal:"),
//             executeRes.error?.message
//           );
//           return;
//         }

//         console.log(chalk.green(`\n✅ Proposal executed successfully!`));
//         console.log(chalk.blue(`Transaction: ${executeRes.data}`));
//       } catch (error) {
//         console.error(chalk.red("Failed to execute proposal:"), error);
//       }
//     });

//   // Add new list command for proposals
//   proposalCommand
//     .command("list")
//     .description("List all proposals for the current DAO")
//     .option("--all", "Show all proposals including completed ones", false)
//     .option("--limit <number>", "Limit the number of proposals shown", "10")
//     .action(async (options) => {
//       try {
//         // Load wallet and connection
//         const walletRes = await WalletService.loadWallet();
//         if (!walletRes.success || !walletRes.data) {
//           console.log(
//             chalk.red("No wallet configured. Please create a wallet first.")
//           );
//           return;
//         }

//         // Check config
//         const configRes = await ConfigService.getConfig();
//         if (
//           !configRes.success ||
//           !configRes.data ||
//           !configRes.data.dao?.activeRealm
//         ) {
//           console.log(
//             chalk.yellow(
//               'No DAO configured. Use "dao use <ADDRESS>" to select one.'
//             )
//           );
//           return;
//         }

//         const connectionRes = await ConnectionService.getConnection();
//         if (!connectionRes.success || !connectionRes.data) {
//           console.log(chalk.red("Failed to establish connection"));
//           return;
//         }

//         const connection = connectionRes.data;
//         const realmAddress = new PublicKey(configRes.data.dao.activeRealm);

//         // Get realm info
//         const realmInfoRes = await GovernanceService.getRealmInfo(
//           connection,
//           realmAddress
//         );
//         if (!realmInfoRes.success || !realmInfoRes.data) {
//           console.log(
//             chalk.red("Failed to get DAO information:"),
//             realmInfoRes.error?.message
//           );
//           return;
//         }

//         console.log(
//           chalk.blue(`\nFetching proposals for DAO: ${realmInfoRes.data.name}`)
//         );

//         // Use the new method in GovernanceService to fetch proposals for this realm
//         const proposalRes = await GovernanceService.getProposalsForRealm(
//           connection,
//           realmAddress
//         );
//         if (!proposalRes.success || !proposalRes.data) {
//           console.log(
//             chalk.red("Failed to fetch proposals:"),
//             proposalRes.error?.message
//           );
//           return;
//         }

//         const proposals = proposalRes.data.proposals;
//         if (proposals.length === 0) {
//           console.log(chalk.yellow("No proposals found for this DAO"));
//           return;
//         }

//         // Filter proposals if --all is not specified
//         const limit = parseInt(options.limit) || 10;
//         const filteredProposals = options.all
//           ? proposals
//           : proposals.filter(
//               (p) =>
//                 !p.state.completed && !p.state.cancelled && !p.state.defeated
//             );

//         // Limit the number of proposals shown
//         const limitedProposals = filteredProposals.slice(0, limit);

//         console.log(
//           chalk.green(
//             `\nFound ${filteredProposals.length} proposals (showing ${Math.min(
//               limit,
//               filteredProposals.length
//             )}):`
//           )
//         );

//         console.log(chalk.bold("\nID | STATE | TITLE | ADDRESS"));
//         console.log(chalk.bold("--------------------------------------"));

//         // Show each proposal
//         limitedProposals.forEach((proposal: ProposalV2, index) => {
//           const { chalk: stateColor, text } = getStateColor(proposal);
//           console.log(
//             `${index + 1}. ${stateColor(text)} | ${chalk.cyan(
//               proposal.name
//             )} | ${proposal.publicKey.toBase58()}`
//           );
//         });

//         console.log(
//           chalk.yellow(
//             "\nUse 'proposal vote --proposal <ADDRESS>' to vote on a proposal"
//           )
//         );
//         console.log(
//           chalk.yellow(
//             "Use 'proposal execute --proposal <ADDRESS>' to execute an approved proposal"
//           )
//         );

//         if (options.all === false && filteredProposals.length > limit) {
//           console.log(
//             chalk.blue(
//               `\nShowing ${limit} of ${filteredProposals.length} proposals. Use --all to show all proposals.`
//             )
//           );
//         }
//       } catch (error) {
//         console.error(chalk.red("Failed to list proposals:"), error);
//       }
//     });
// }

// // Helper function to color code proposal states
// function getStateColor(state: ProposalV2): {
//   chalk: chalk.Chalk;
//   text: string;
// } {
//   if (state.state.draft) {
//     return { chalk: chalk.gray, text: "Draft" };
//   }
//   if (state.state.signingOff) {
//     return { chalk: chalk.yellow, text: "Signing Off" };
//   }
//   if (state.state.voting) {
//     return { chalk: chalk.blue, text: "Voting" };
//   }
//   if (state.state.succeeded) {
//     return { chalk: chalk.green, text: "Succeeded" };
//   }
//   if (state.state.executing) {
//     return { chalk: chalk.green, text: "Executing" };
//   }
//   if (state.state.completed) {
//     return { chalk: chalk.green, text: "Completed" };
//   }
//   if (state.state.cancelled) {
//     return { chalk: chalk.red, text: "Cancelled" };
//   }
//   if (state.state.defeated) {
//     return { chalk: chalk.red, text: "Defeated" };
//   }
//   return { chalk: chalk.white, text: "Unknown" };
// }
