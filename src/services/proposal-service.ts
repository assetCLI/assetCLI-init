// import {
//   Connection,
//   Keypair,
//   PublicKey,
//   SystemProgram,
//   LAMPORTS_PER_SOL,
//   TransactionInstruction,
//   AccountMeta,
// } from "@solana/web3.js";
// import {
//   getAssociatedTokenAddressSync,
//   getMint,
//   createAssociatedTokenAccountInstruction,
//   createTransferInstruction,
// } from "@solana/spl-token";
// import { SplGovernance } from "governance-idl-sdk";
// import { SPL_GOVERNANCE_PROGRAM_ID } from "../utils/constants";
// import { MultisigService } from "./multisig-service";
// import { ServiceResponse, ProposalData } from "../types/service-types";
// import { sendTx } from "../utils/send_tx";

// /**
//  * Service for managing proposals and transfers in the DAO
//  */
// export class ProposalService {
//   static programId = new PublicKey(SPL_GOVERNANCE_PROGRAM_ID);

//   // Constants for proposal description parsing
//   private static readonly MULTISIG_TAG = "--- MULTISIG TRANSACTION INFO ---";
//   private static readonly MULTISIG_ADDRESS_PREFIX = "Multisig Address: ";
//   private static readonly TX_INDEX_PREFIX = "Transaction Index: ";

//   /**
//    * Creates a transfer SOL instruction to be used in a proposal
//    * @param connection Solana connection
//    * @param realmAddress Realm address
//    * @param amount Amount of SOL to transfer
//    * @param recipientAddress Recipient address
//    * @returns Instruction for SOL transfer
//    */
//   static async getSolTransferInstruction(
//     connection: Connection,
//     realmAddress: PublicKey,
//     amount: number | bigint,
//     recipientAddress: PublicKey
//   ): Promise<ServiceResponse<TransactionInstruction>> {
//     try {
//       const splGovernance = new SplGovernance(connection, this.programId);

//       // Get the governance account for the realm
//       const governanceId = splGovernance.pda.governanceAccount({
//         realmAccount: realmAddress,
//         seed: realmAddress,
//       }).publicKey;

//       // Get the native treasury account
//       const nativeTreasuryId = splGovernance.pda.nativeTreasuryAccount({
//         governanceAccount: governanceId,
//       }).publicKey;

//       // Calculate lamports
//       const lamports =
//         typeof amount === "number"
//           ? amount * LAMPORTS_PER_SOL
//           : amount * BigInt(LAMPORTS_PER_SOL);

//       // Create transfer instruction
//       const instruction = SystemProgram.transfer({
//         fromPubkey: nativeTreasuryId,
//         toPubkey: recipientAddress,
//         lamports: typeof lamports === "bigint" ? Number(lamports) : lamports,
//       });

//       return {
//         success: true,
//         data: instruction,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to create SOL transfer instruction",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Creates a transfer SPL token instruction to be used in a proposal
//    */
//   static async getTokenTransferInstruction(
//     connection: Connection,
//     realmAddress: PublicKey,
//     tokenMint: PublicKey,
//     amount: number | bigint,
//     recipientAddress: PublicKey
//   ): Promise<ServiceResponse<TransactionInstruction[]>> {
//     try {
//       const splGovernance = new SplGovernance(connection, this.programId);

//       // Get the governance account for the realm
//       const governanceId = splGovernance.pda.governanceAccount({
//         realmAccount: realmAddress,
//         seed: realmAddress,
//       }).publicKey;

//       // Get the native treasury account
//       const nativeTreasuryId = splGovernance.pda.nativeTreasuryAccount({
//         governanceAccount: governanceId,
//       }).publicKey;

//       // Get token accounts
//       const sourceTokenAccount = getAssociatedTokenAddressSync(
//         tokenMint,
//         nativeTreasuryId,
//         true // Allow PDA
//       );

//       const recipientTokenAccount = getAssociatedTokenAddressSync(
//         tokenMint,
//         recipientAddress,
//         true
//       );

//       // Check if recipient token account exists
//       const instructions: TransactionInstruction[] = [];
//       const recipientAccountInfo = await connection.getAccountInfo(
//         recipientTokenAccount
//       );

//       if (!recipientAccountInfo) {
//         instructions.push(
//           createAssociatedTokenAccountInstruction(
//             nativeTreasuryId, // payer (will be replaced by treasury in execution)
//             recipientTokenAccount,
//             recipientAddress,
//             tokenMint
//           )
//         );
//       }

//       // Get token info for decimals
//       const tokenInfo = await getMint(connection, tokenMint);

//       // Calculate transfer amount with decimals
//       const adjustedAmount =
//         typeof amount === "number"
//           ? amount * Math.pow(10, tokenInfo.decimals)
//           : amount * BigInt(Math.pow(10, tokenInfo.decimals));

//       // Add transfer instruction
//       instructions.push(
//         createTransferInstruction(
//           sourceTokenAccount,
//           recipientTokenAccount,
//           nativeTreasuryId, // authority
//           typeof adjustedAmount === "bigint"
//             ? Number(adjustedAmount)
//             : adjustedAmount
//         )
//       );

//       return {
//         success: true,
//         data: instructions,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to create token transfer instruction",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Creates a transfer SOL instruction for the Squads multisig
//    */
//   static async getSquadsMultisigSolTransferInstruction(
//     connection: Connection,
//     multisigAddress: PublicKey,
//     amount: number | bigint,
//     recipientAddress: PublicKey
//   ): Promise<ServiceResponse<TransactionInstruction>> {
//     try {
//       // Get the Squads vault PDA for index 0
//       const vaultPda =
//         MultisigService.getMultisigVaultPda(multisigAddress).data!;

//       // Calculate lamports
//       const lamports =
//         typeof amount === "number"
//           ? amount * LAMPORTS_PER_SOL
//           : amount * BigInt(LAMPORTS_PER_SOL);

//       // Create the inner transfer instruction that will be executed by the vault
//       // This is what will actually move SOL from the vault to the recipient
//       const transferInstruction = SystemProgram.transfer({
//         fromPubkey: vaultPda,
//         toPubkey: recipientAddress,
//         lamports: typeof lamports === "bigint" ? Number(lamports) : lamports,
//       });

//       // Build a transaction message with our transfer instruction
//       // This is what the vault will execute when the multisig transaction is approved and executed
//       // Note we're returning the transfer instruction directly, as it will be wrapped in createIntegratedAssetTransferProposal
//       return {
//         success: true,
//         data: transferInstruction,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to create multisig SOL transfer instruction",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Creates a transfer SPL token instruction for the Squads multisig
//    */
//   static async getSquadsMultisigTokenTransferInstruction(
//     connection: Connection,
//     multisigAddress: PublicKey,
//     tokenMint: PublicKey,
//     amount: number | bigint,
//     recipientAddress: PublicKey
//   ): Promise<ServiceResponse<TransactionInstruction[]>> {
//     try {
//       // Get the Squads vault PDA for index 0
//       const vaultPda =
//         MultisigService.getMultisigVaultPda(multisigAddress).data!;
//       // Get token accounts
//       const sourceTokenAccount = getAssociatedTokenAddressSync(
//         tokenMint,
//         vaultPda,
//         true // Allow PDA
//       );
//       const recipientTokenAccount = getAssociatedTokenAddressSync(
//         tokenMint,
//         recipientAddress,
//         true
//       );
//       const instructions: TransactionInstruction[] = [];
//       const recipientAccountInfo = await connection.getAccountInfo(
//         recipientTokenAccount
//       );
//       if (!recipientAccountInfo) {
//         instructions.push(
//           createAssociatedTokenAccountInstruction(
//             vaultPda, // payer
//             recipientTokenAccount,
//             recipientAddress,
//             tokenMint
//           )
//         );
//       }
//       // Get token info for decimals
//       const tokenInfo = await getMint(connection, tokenMint);
//       // Calculate transfer amount with decimals
//       const adjustedAmount =
//         typeof amount === "number"
//           ? amount * Math.pow(10, tokenInfo.decimals)
//           : amount * BigInt(Math.pow(10, tokenInfo.decimals));
//       // Add transfer instruction
//       instructions.push(
//         createTransferInstruction(
//           sourceTokenAccount,
//           recipientTokenAccount,
//           vaultPda, // authority
//           typeof adjustedAmount === "bigint"
//             ? Number(adjustedAmount)
//             : adjustedAmount
//         )
//       );
//       return {
//         success: true,
//         data: instructions,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to create multisig token transfer instruction",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Create a proposal to transfer assets from the Squads multisig via DAO
//    * This creates an integrated proposal with embedded multisig information
//    */
//   static async createIntegratedAssetTransferProposal(
//     connection: Connection,
//     keypair: Keypair,
//     realmAddress: PublicKey,
//     title: string,
//     description: string,
//     instructions: TransactionInstruction[]
//   ): Promise<ServiceResponse<PublicKey>> {
//     try {
//       // Find the multisig associated with this realm
//       const multisigAddress =
//         MultisigService.getMultisigForRealm(realmAddress).data!;

//       const createTxAndProposalRes =
//         await MultisigService.createTransactionWithProposal(
//           connection,
//           multisigAddress,
//           keypair,
//           instructions,
//           title
//         );

//       if (!createTxAndProposalRes.success || !createTxAndProposalRes.data) {
//         return {
//           success: false,
//           error: createTxAndProposalRes.error ?? {
//             message: "Failed to create integrated asset transfer proposal",
//           },
//         };
//       }

//       const transactionIndex = createTxAndProposalRes.data.transactionIndex;

//       // Include multisig info in the description
//       const enhancedDescription =
//         `${description}\n\n` +
//         `${this.MULTISIG_TAG}\n` +
//         `${this.MULTISIG_ADDRESS_PREFIX}${multisigAddress.toBase58()}\n` +
//         `${this.TX_INDEX_PREFIX}${transactionIndex}\n` +
//         `----------------------------`;
//       const proposalAddress = (
//         await this.createProposal(
//           connection,
//           keypair,
//           realmAddress,
//           title,
//           enhancedDescription,
//           [] // empty instructions array as the actual execution happens in the multisig
//         )
//       ).data!;
//       return {
//         success: true,
//         data: proposalAddress,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to create integrated asset transfer proposal",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Ensures a token owner record exists for the user
//    * Modified to use MultisigService.executeInstructions
//    */
//   static async ensureTokenOwnerRecord(
//     connection: Connection,
//     keypair: Keypair,
//     realmAddress: PublicKey
//   ): Promise<ServiceResponse<PublicKey>> {
//     try {
//       const splGovernance = new SplGovernance(connection, this.programId);
//       try {
//         const realmInfo = await splGovernance.getRealmByPubkey(realmAddress);
//         const councilMint = realmInfo.config.councilMint;

//         if (!councilMint) {
//           throw new Error("Council mint not found for this realm");
//         }
//         // Check if token owner record already exists
//         const tokenOwnerRecordPda = splGovernance.pda.tokenOwnerRecordAccount({
//           realmAccount: realmAddress,
//           governingTokenMintAccount: councilMint,
//           governingTokenOwner: keypair.publicKey,
//         });
//         try {
//           const tokenOwnerRecord =
//             await splGovernance.getTokenOwnerRecordByPubkey(
//               tokenOwnerRecordPda.publicKey
//             );
//           return {
//             success: true,
//             data: tokenOwnerRecordPda.publicKey,
//           };
//         } catch (err) {
//           // Create token owner record instruction
//           const createTokenOwnerRecordIx =
//             await splGovernance.createTokenOwnerRecordInstruction(
//               realmAddress,
//               keypair.publicKey,
//               councilMint,
//               keypair.publicKey
//             );

//           // Deposit governing tokens instruction
//           const depositGovTokenIx =
//             await splGovernance.depositGoverningTokensInstruction(
//               realmAddress,
//               councilMint,
//               councilMint, // source token mint = council mint (direct deposit)
//               keypair.publicKey,
//               keypair.publicKey,
//               keypair.publicKey,
//               1
//             );

//           // Execute instructions using MultisigService.executeInstructions
//           const txResult = await sendTx(connection, keypair, [
//             createTokenOwnerRecordIx,
//             depositGovTokenIx,
//           ]);

//           if (!txResult.success) {
//             return {
//               success: false,
//               error: {
//                 message: "Failed to create token owner record",
//                 details: txResult.error,
//               },
//             };
//           }
//           return {
//             success: true,
//             data: tokenOwnerRecordPda.publicKey,
//           };
//         }
//       } catch (error) {
//         throw error;
//       }
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to ensure token owner record",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Creates a DAO proposal with the given instructions
//    * Modified to use MultisigService.executeInstructions
//    */
//   static async createProposal(
//     connection: Connection,
//     keypair: Keypair,
//     realmAddress: PublicKey,
//     title: string,
//     description: string,
//     instructions: TransactionInstruction[]
//   ): Promise<ServiceResponse<PublicKey>> {
//     try {
//       const splGovernance = new SplGovernance(connection, this.programId);

//       // First ensure the token owner record exists
//       const tokenOwnerRecordResult = await this.ensureTokenOwnerRecord(
//         connection,
//         keypair,
//         realmAddress
//       );

//       if (!tokenOwnerRecordResult.success) {
//         return tokenOwnerRecordResult;
//       }

//       const tokenOwnerRecordKey = tokenOwnerRecordResult.data!;

//       // Get the governance account for the realm
//       const governanceId = splGovernance.pda.governanceAccount({
//         realmAccount: realmAddress,
//         seed: realmAddress,
//       }).publicKey;

//       // Get realm info to find the council mint
//       const realmInfo = await splGovernance.getRealmByPubkey(realmAddress);
//       const councilMint = realmInfo.config.councilMint;

//       if (!councilMint) {
//         return {
//           success: false,
//           error: {
//             message: "Council mint not found for this realm",
//           },
//         };
//       }

//       const proposalSeed = Keypair.generate().publicKey;

//       // Create proposal PDA address
//       const proposalPda = splGovernance.pda.proposalAccount({
//         governanceAccount: governanceId,
//         governingTokenMint: councilMint,
//         proposalSeed,
//       });

//       // Build create proposal instruction
//       const createProposalIx = await splGovernance.createProposalInstruction(
//         title,
//         description,
//         { choiceType: "single", multiChoiceOptions: null },
//         ["Approve"],
//         true, // use denial option
//         realmAddress,
//         governanceId,
//         tokenOwnerRecordKey,
//         councilMint,
//         keypair.publicKey,
//         keypair.publicKey,
//         proposalSeed
//       );

//       // Add transaction instruction
//       const insertIx = await splGovernance.insertTransactionInstruction(
//         instructions,
//         0, // option index
//         0, // instruction index
//         0, // hold up time
//         governanceId,
//         proposalPda.publicKey,
//         tokenOwnerRecordKey,
//         keypair.publicKey,
//         keypair.publicKey
//       );

//       // Sign off on the proposal
//       const signOffIx = await splGovernance.signOffProposalInstruction(
//         realmAddress,
//         governanceId,
//         proposalPda.publicKey,
//         keypair.publicKey,
//         tokenOwnerRecordKey
//       );

//       // Execute instructions using MultisigService.executeInstructions
//       const txResult = await sendTx(connection, keypair, [
//         createProposalIx,
//         insertIx,
//         signOffIx,
//       ]);

//       if (!txResult.success) {
//         return {
//           success: false,
//           error: {
//             message: "Failed to create proposal",
//             details: txResult.error,
//           },
//         };
//       }
//       return {
//         success: true,
//         data: proposalPda.publicKey,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to create proposal",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Cast a vote on a proposal with automatic multisig execution when threshold is met
//    * Modified to use MultisigService.executeInstructions
//    */
//   static async castVote(
//     connection: Connection,
//     keypair: Keypair,
//     realmAddress: PublicKey,
//     proposalAddress: PublicKey,
//     approve: boolean
//   ): Promise<ServiceResponse<string>> {
//     try {
//       const splGovernance = new SplGovernance(connection, this.programId);

//       // Get proposal info
//       const proposal = await splGovernance.getProposalByPubkey(proposalAddress);

//       // Extract multisig info from description if available
//       const multisigInfo = this.extractMultisigInfo(proposal.descriptionLink);

//       // Get governance account
//       const governanceId = proposal.governance;

//       // Get realm info to find the council mint
//       const realmInfo = await splGovernance.getRealmByPubkey(realmAddress);
//       const councilMint = realmInfo.config.councilMint;

//       if (!councilMint) {
//         return {
//           success: false,
//           error: {
//             message: "Council mint not found for this realm",
//           },
//         };
//       }

//       // Get token owner record for the voter
//       const tokenOwnerRecordPda = splGovernance.pda.tokenOwnerRecordAccount({
//         realmAccount: realmAddress,
//         governingTokenMintAccount: councilMint,
//         governingTokenOwner: keypair.publicKey,
//       });

//       const ensureTokenOwnerRecordRes = await this.ensureTokenOwnerRecord(
//         connection,
//         keypair,
//         realmAddress
//       );

//       if (!ensureTokenOwnerRecordRes.success) {
//         return {
//           success: false,
//           error: ensureTokenOwnerRecordRes.error ?? {
//             message: "Failed to ensure token owner record",
//           },
//         };
//       }

//       // Build vote instruction
//       const voteIx = await splGovernance.castVoteInstruction(
//         approve
//           ? { approve: [[{ rank: 0, weightPercentage: 100 }]] }
//           : { deny: {} },
//         realmAddress,
//         governanceId,
//         proposalAddress,
//         proposal.tokenOwnerRecord,
//         tokenOwnerRecordPda.publicKey,
//         keypair.publicKey,
//         councilMint,
//         keypair.publicKey
//       );

//       // Execute instructions using MultisigService.executeInstructions
//       const txResult = await sendTx(connection, keypair, [voteIx]);
//       if (!txResult.success) {
//         return txResult;
//       }

//       // If this is an integrated proposal with multisig info and it's an approval,
//       if (
//         multisigInfo.multisigAddress &&
//         multisigInfo.transactionIndex &&
//         approve
//       ) {
//         try {
//           // Use the approve functionality from MultisigService
//           const approveResult = await MultisigService.approveProposal(
//             connection,
//             keypair,
//             multisigInfo.multisigAddress,
//             multisigInfo.transactionIndex
//           );

//           if (approveResult.success && approveResult.data) {
//             // Extra log data could be added to the response
//             return {
//               success: true,
//               data: `Multisig approve: ${approveResult.data} \n Dao approve: ${txResult.data}`,
//             };
//           }
//         } catch (error) {
//           // Don't fail the vote if multisig actions fail
//           // Log could be added to response
//         }
//       }

//       return {
//         success: true,
//         data: `Dao approve: ${txResult.data!}`,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to cast vote",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Execute an approved proposal
//    * Modified to use MultisigService.executeInstructions
//    */
//   static async executeProposal(
//     connection: Connection,
//     keypair: Keypair,
//     proposalAddress: PublicKey
//   ): Promise<ServiceResponse<string>> {
//     try {
//       const splGovernance = new SplGovernance(connection, this.programId);

//       // Get proposal info
//       const proposal = await splGovernance.getProposalByPubkey(proposalAddress);
//       const { multisigAddress, transactionIndex } = this.extractMultisigInfo(
//         proposal.descriptionLink
//       );
//       // Get governance account
//       const governanceId = proposal.governance;
//       // Get the proposal transaction account
//       const proposalTxPda = splGovernance.pda.proposalTransactionAccount({
//         proposal: proposalAddress,
//         optionIndex: 0,
//         index: 0,
//       });
//       // Get transaction details
//       const proposalTx = await splGovernance.getProposalTransactionByPubkey(
//         proposalTxPda.publicKey
//       );
//       // Get the native treasury to fix any isSigner flags
//       const nativeTreasuryId = splGovernance.pda.nativeTreasuryAccount({
//         governanceAccount: governanceId,
//       }).publicKey;
//       let accountsForIx: AccountMeta[];
//       if (proposalTx.instructions.length > 0) {
//         // Reconstruct accounts for execution
//         accountsForIx = proposalTx.instructions[0].accounts;
//         // Add program ID as first account
//         accountsForIx.unshift({
//           pubkey: proposalTx.instructions[0].programId,
//           isSigner: false,
//           isWritable: false,
//         });

//         // Fix signer flags
//         accountsForIx.forEach((account) => {
//           if (account.pubkey.equals(nativeTreasuryId)) {
//             account.isSigner = false;
//           }
//           // Also the keypair itself should be the only true signer
//           if (!account.pubkey.equals(keypair.publicKey) && account.isSigner) {
//             account.isSigner = false;
//           }
//         });
//       } else {
//         accountsForIx = [
//           {
//             pubkey: nativeTreasuryId,
//             isSigner: false,
//             isWritable: true,
//           },
//         ];
//       }
//       // Build execution instruction
//       const executeIx = await splGovernance.executeTransactionInstruction(
//         governanceId,
//         proposalAddress,
//         proposalTxPda.publicKey,
//         accountsForIx
//       );
//       // Execute instructions using MultisigService.executeInstructions
//       const txResult = await sendTx(connection, keypair, [executeIx]);
//       if (!txResult.success) {
//         return txResult;
//       }
//       // If this has created a multisig transaction, try to automatically approve and execute
//       if (multisigAddress && transactionIndex) {
//         try {
//           // Get proposal status using MultisigService
//           const proposalStatus = (
//             await MultisigService.getProposalStatus(
//               connection,
//               multisigAddress,
//               transactionIndex
//             )
//           ).data!;
//           if (proposalStatus.meetsThreshold) {
//             const executeRes = await MultisigService.executeMultisigTransaction(
//               connection,
//               keypair,
//               multisigAddress,
//               transactionIndex
//             );
//             if (executeRes.success) {
//               return {
//                 success: true,
//                 data: `Multisig execute: ${executeRes.data} \n Dao execute: ${txResult.data}`,
//               };
//             }
//           }
//         } catch (error) {
//           return {
//             success: false,
//             error: {
//               message: "Failed to execute multisig transaction",
//               details: error,
//             },
//           };
//         }
//       }
//       return {
//         success: true,
//         data: `Dao execute: ${txResult.data!}`,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to execute proposal",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Extract multisig information from a proposal description
//    */
//   private static extractMultisigInfo(description: string): {
//     multisigAddress?: PublicKey;
//     transactionIndex?: number;
//   } {
//     try {
//       // Check if this is an integrated proposal with multisig info
//       if (!description.includes(this.MULTISIG_TAG)) {
//         return {};
//       }

//       // Extract multisig address
//       const addressLine = description
//         .split("\n")
//         .find((line) => line.startsWith(this.MULTISIG_ADDRESS_PREFIX));

//       // Extract transaction index
//       const indexLine = description
//         .split("\n")
//         .find((line) => line.startsWith(this.TX_INDEX_PREFIX));

//       if (addressLine && indexLine) {
//         const address = addressLine
//           .substring(this.MULTISIG_ADDRESS_PREFIX.length)
//           .trim();
//         const index = indexLine.substring(this.TX_INDEX_PREFIX.length).trim();

//         return {
//           multisigAddress: new PublicKey(address),
//           transactionIndex: parseInt(index),
//         };
//       }
//     } catch (error) {}
//     return {};
//   }
// }
