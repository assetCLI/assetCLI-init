// Deprecated: This file is no longer used. This tool has been removed from the CLI.

// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import { z } from "zod";
// import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
// import { ProposalService } from "../services/proposal-service";
// import { GovernanceService } from "../services/governance-service";
// import { ProposalV2 } from "governance-idl-sdk";
// import { useMcpContext } from "../utils/mcp-hooks";

// export function registerProposalTools(server: McpServer) {
//   server.tool(
//     "transferProposal",
//     "Create a proposal to transfer SOL or tokens from the DAO",
//     {
//       name: z.string().optional().default("Asset Transfer"),
//       description: z.string().optional().default("Transfer assets from DAO"),
//       amount: z.number(),
//       mint: z.string().optional(),
//       recipient: z.string(),
//     },
//     async ({ name, description, amount, mint, recipient }) => {
//       try {
//         const context = await useMcpContext({
//           requireWallet: true,
//           requireDao: true,
//         });

//         if (!context.success) {
//           return {
//             content: [
//               { type: "text", text: context.error || "Failed to get context" },
//             ],
//           };
//         }

//         const { connection, keypair, realmAddress } = context;

//         // Parse recipient
//         let recipientAddress: PublicKey;
//         try {
//           recipientAddress = new PublicKey(recipient);
//         } catch (e) {
//           return {
//             content: [{ type: "text", text: "Invalid recipient address." }],
//           };
//         }

//         // Validate amount
//         if (isNaN(amount) || amount <= 0) {
//           return {
//             content: [
//               {
//                 type: "text",
//                 text: "Invalid amount. Please provide a positive number.",
//               },
//             ],
//           };
//         }

//         // Get DAO type (integrated or standard)
//         const realmInfoRes = await GovernanceService.getRealmInfo(
//           connection,
//           realmAddress!
//         );

//         if (!realmInfoRes.success || !realmInfoRes.data) {
//           return {
//             content: [
//               {
//                 type: "text",
//                 text: `Failed to get DAO information: ${realmInfoRes.error?.message}`,
//               },
//             ],
//           };
//         }

//         const realmInfo = realmInfoRes.data;
//         const isIntegrated = realmInfo.isIntegrated;

//         // Check balance of the source account
//         let sourceAddress: PublicKey;
//         let sourceBalance: number;

//         if (isIntegrated && realmInfo.vaultAddress) {
//           sourceAddress = realmInfo.vaultAddress;
//           sourceBalance = await connection.getBalance(sourceAddress);
//         } else {
//           sourceAddress = realmInfo.treasuryAddress;
//           sourceBalance = await connection.getBalance(sourceAddress);
//         }

//         if (!mint && sourceBalance < amount * LAMPORTS_PER_SOL) {
//           return {
//             content: [
//               {
//                 type: "text",
//                 text: "Insufficient funds in treasury/vault to execute this transfer.",
//               },
//             ],
//           };
//         }

//         // Build instructions based on DAO type and transfer type (SOL or Token)
//         let instructionsRes;
//         let proposalAddressRes;

//         if (mint) {
//           // Token transfer
//           const tokenMint = new PublicKey(mint);

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
//               return {
//                 content: [
//                   {
//                     type: "text",
//                     text: `Failed to create transfer instruction: ${instructionsRes.error?.message}`,
//                   },
//                 ],
//               };
//             }

//             proposalAddressRes =
//               await ProposalService.createIntegratedAssetTransferProposal(
//                 connection,
//                 keypair,
//                 realmAddress!,
//                 name,
//                 description,
//                 instructionsRes.data
//               );
//           } else {
//             instructionsRes = await ProposalService.getTokenTransferInstruction(
//               connection,
//               realmAddress!,
//               tokenMint,
//               amount,
//               recipientAddress
//             );

//             if (!instructionsRes.success || !instructionsRes.data) {
//               return {
//                 content: [
//                   {
//                     type: "text",
//                     text: `Failed to create transfer instruction: ${instructionsRes.error?.message}`,
//                   },
//                 ],
//               };
//             }

//             proposalAddressRes = await ProposalService.createProposal(
//               connection,
//               keypair,
//               realmAddress!,
//               name,
//               description,
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
//               return {
//                 content: [
//                   {
//                     type: "text",
//                     text: `Failed to create transfer instruction: ${transferIxRes.error?.message}`,
//                   },
//                 ],
//               };
//             }

//             proposalAddressRes =
//               await ProposalService.createIntegratedAssetTransferProposal(
//                 connection,
//                 keypair,
//                 realmAddress!,
//                 name,
//                 description,
//                 [transferIxRes.data]
//               );
//           } else {
//             // For standard DAO, create a treasury transfer
//             const transferIxRes =
//               await ProposalService.getSolTransferInstruction(
//                 connection,
//                 realmAddress!,
//                 amount,
//                 recipientAddress
//               );

//             if (!transferIxRes.success || !transferIxRes.data) {
//               return {
//                 content: [
//                   {
//                     type: "text",
//                     text: `Failed to create transfer instruction: ${transferIxRes.error?.message}`,
//                   },
//                 ],
//               };
//             }

//             proposalAddressRes = await ProposalService.createProposal(
//               connection,
//               keypair,
//               realmAddress!,
//               name,
//               description,
//               [transferIxRes.data]
//             );
//           }
//         }

//         if (!proposalAddressRes.success || !proposalAddressRes.data) {
//           return {
//             content: [
//               {
//                 type: "text",
//                 text: `Failed to create proposal: ${proposalAddressRes.error?.message}`,
//               },
//             ],
//           };
//         }

//         const result = {
//           success: true,
//           proposalAddress: proposalAddressRes.data.toBase58(),
//           name,
//           description,
//           transferType: mint ? "token" : "sol",
//           amount,
//           recipient: recipientAddress.toBase58(),
//           mint: mint ? mint : null,
//         };

//         return {
//           content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
//         };
//       } catch (error) {
//         return {
//           content: [
//             { type: "text", text: `Failed to create proposal: ${error}` },
//           ],
//         };
//       }
//     }
//   );

//   server.tool(
//     "voteProposal",
//     "Vote on an existing proposal",
//     {
//       proposal: z.string(),
//       approve: z.boolean().optional().default(true),
//     },
//     async ({ proposal, approve }) => {
//       try {
//         const context = await useMcpContext({
//           requireWallet: true,
//           requireDao: true,
//         });

//         if (!context.success) {
//           return {
//             content: [
//               { type: "text", text: context.error || "Failed to get context" },
//             ],
//           };
//         }

//         const { connection, keypair, realmAddress } = context;

//         // Parse proposal address
//         let proposalAddress: PublicKey;
//         try {
//           proposalAddress = new PublicKey(proposal);
//         } catch (e) {
//           return {
//             content: [{ type: "text", text: "Invalid proposal address." }],
//           };
//         }

//         // Cast vote
//         const voteRes = await ProposalService.castVote(
//           connection,
//           keypair,
//           realmAddress!,
//           proposalAddress,
//           approve
//         );

//         if (!voteRes.success) {
//           return {
//             content: [
//               {
//                 type: "text",
//                 text: `Failed to cast vote: ${voteRes.error?.message}`,
//               },
//             ],
//           };
//         }

//         const result = {
//           success: true,
//           proposal: proposalAddress.toBase58(),
//           vote: approve ? "approve" : "reject",
//           transaction: voteRes.data,
//         };

//         return {
//           content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
//         };
//       } catch (error) {
//         return {
//           content: [
//             { type: "text", text: `Failed to vote on proposal: ${error}` },
//           ],
//         };
//       }
//     }
//   );

//   server.tool(
//     "executeProposal",
//     "Execute an approved proposal",
//     {
//       proposal: z.string(),
//     },
//     async ({ proposal }) => {
//       try {
//         const context = await useMcpContext({ requireWallet: true });
//         if (!context.success) {
//           return {
//             content: [
//               { type: "text", text: context.error || "Failed to get context" },
//             ],
//           };
//         }

//         const { connection, keypair } = context;

//         // Parse proposal address
//         let proposalAddress: PublicKey;
//         try {
//           proposalAddress = new PublicKey(proposal);
//         } catch (e) {
//           return {
//             content: [{ type: "text", text: "Invalid proposal address." }],
//           };
//         }

//         // Execute the proposal
//         const executeRes = await ProposalService.executeProposal(
//           connection,
//           keypair,
//           proposalAddress
//         );

//         if (!executeRes.success) {
//           return {
//             content: [
//               {
//                 type: "text",
//                 text: `Failed to execute proposal: ${executeRes.error?.message}`,
//               },
//             ],
//           };
//         }

//         const result = {
//           success: true,
//           proposal: proposalAddress.toBase58(),
//           transaction: executeRes.data,
//         };

//         return {
//           content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
//         };
//       } catch (error) {
//         return {
//           content: [
//             { type: "text", text: `Failed to execute proposal: ${error}` },
//           ],
//         };
//       }
//     }
//   );

//   server.tool(
//     "listProposals",
//     "List all proposals for the current DAO",
//     {
//       showAll: z.boolean().optional().default(false),
//       limit: z.number().optional().default(10),
//     },
//     async ({ showAll, limit }) => {
//       try {
//         const context = await useMcpContext({ requireDao: true });
//         if (!context.success) {
//           return {
//             content: [
//               { type: "text", text: context.error || "Failed to get context" },
//             ],
//           };
//         }

//         const { connection, realmAddress } = context;

//         // Use the method in GovernanceService to fetch proposals for this realm
//         const proposalRes = await GovernanceService.getProposalsForRealm(
//           connection,
//           realmAddress!
//         );

//         if (!proposalRes.success || !proposalRes.data) {
//           return {
//             content: [
//               {
//                 type: "text",
//                 text: `Failed to fetch proposals: ${proposalRes.error?.message}`,
//               },
//             ],
//           };
//         }

//         const proposals = proposalRes.data.proposals;
//         if (proposals.length === 0) {
//           return {
//             content: [
//               {
//                 type: "text",
//                 text: JSON.stringify({ proposals: [] }, null, 2),
//               },
//             ],
//           };
//         }

//         // Filter proposals if showAll is not specified
//         const filteredProposals = showAll
//           ? proposals
//           : proposals.filter(
//               (p) =>
//                 !p.state.completed && !p.state.cancelled && !p.state.defeated
//             );

//         // Limit the number of proposals shown
//         const limitedProposals = filteredProposals.slice(0, limit);

//         // Format proposals
//         const formattedProposals = limitedProposals.map(
//           (proposal: ProposalV2, index) => {
//             const state = getProposalState(proposal);
//             return {
//               index: index + 1,
//               name: proposal.name,
//               state: state,
//               address: proposal.publicKey.toBase58(),
//               description: proposal.descriptionLink,
//             };
//           }
//         );

//         const result = {
//           total: proposals.length,
//           filtered: filteredProposals.length,
//           showing: formattedProposals.length,
//           proposals: formattedProposals,
//         };

//         return {
//           content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
//         };
//       } catch (error) {
//         return {
//           content: [
//             { type: "text", text: `Failed to list proposals: ${error}` },
//           ],
//         };
//       }
//     }
//   );
// }

// // Helper function to get the proposal state as a string
// function getProposalState(proposal: ProposalV2): string {
//   if (proposal.state.draft) {
//     return "Draft";
//   }
//   if (proposal.state.signingOff) {
//     return "SigningOff";
//   }
//   if (proposal.state.voting) {
//     return "Voting";
//   }
//   if (proposal.state.succeeded) {
//     return "Succeeded";
//   }
//   if (proposal.state.executing) {
//     return "Executing";
//   }
//   if (proposal.state.completed) {
//     return "Completed";
//   }
//   if (proposal.state.cancelled) {
//     return "Cancelled";
//   }
//   if (proposal.state.defeated) {
//     return "Defeated";
//   }
//   return "Unknown";
// }
