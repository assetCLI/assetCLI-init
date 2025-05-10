// import {
//   Connection,
//   Keypair,
//   PublicKey,
//   TransactionInstruction,
//   SystemProgram,
//   LAMPORTS_PER_SOL,
// } from "@solana/web3.js";
// import {
//   GovernanceConfig,
//   ProposalV2,
//   SplGovernance,
//   TokenOwnerRecord,
// } from "governance-idl-sdk";
// import { SPL_GOVERNANCE_PROGRAM_ID } from "../utils/constants";
// import { ServiceResponse, DaoData } from "../types/service-types";
// import {
//   createMint,
//   getAssociatedTokenAddressSync,
//   getMint,
//   createAssociatedTokenAccountInstruction,
//   createTransferInstruction,
//   AuthorityType,
//   createSetAuthorityInstruction,
// } from "@solana/spl-token";
// import { MultisigService } from "./multisig-service";
// import { sendTx } from "../utils/send_tx";
// import BN from "bn.js";

// const DISABLED_VOTER_WEIGHT = new BN("18446744073709551615");
// const DEFAULT_VOTING_TIME = 86400; // 1 day in seconds

// export class GovernanceService {
//   static programId = new PublicKey(SPL_GOVERNANCE_PROGRAM_ID);

//   /**
//    * Checks if a realm has an associated multisig (is integrated)
//    */
//   static async isIntegratedDao(
//     connection: Connection,
//     realmAddress: PublicKey
//   ): Promise<ServiceResponse<boolean>> {
//     try {
//       // Get the expected multisig address for this realm
//       const multisigResult = MultisigService.getMultisigForRealm(realmAddress);

//       if (!multisigResult.success) {
//         return {
//           success: false,
//           error: {
//             message: "Failed to derive multisig address",
//             details: multisigResult.error,
//           },
//         };
//       }

//       const multisigAddress = multisigResult.data!;

//       // Try to fetch the multisig account to see if it exists
//       const multisigAccountInfo = await connection.getAccountInfo(
//         multisigAddress
//       );

//       // If the account exists, this is an integrated DAO
//       return {
//         success: true,
//         data: multisigAccountInfo !== null,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Error checking if DAO is integrated",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Gets information about a realm including whether it's integrated
//    */
//   static async getRealmInfo(
//     connection: Connection,
//     realmAddress: PublicKey
//   ): Promise<ServiceResponse<DaoData>> {
//     try {
//       const splGovernance = new SplGovernance(connection, this.programId);

//       // Get realm information
//       const realm = await splGovernance.getRealmByPubkey(realmAddress);

//       if (!realm) {
//         return {
//           success: false,
//           error: {
//             message: `Realm not found: ${realmAddress.toBase58()}`,
//           },
//         };
//       }

//       // Get governance from realm
//       const governanceAddress = splGovernance.pda.governanceAccount({
//         realmAccount: realmAddress,
//         seed: realmAddress,
//       }).publicKey;

//       // Get treasury from governance
//       const treasuryAddress = splGovernance.pda.nativeTreasuryAccount({
//         governanceAccount: governanceAddress,
//       }).publicKey;

//       // Check if this is an integrated DAO
//       const integratedResult = await this.isIntegratedDao(
//         connection,
//         realmAddress
//       );
//       const isIntegrated = integratedResult.success
//         ? integratedResult.data!
//         : false;

//       // Build base DAO data
//       const daoData: DaoData = {
//         name: realm.name,
//         realmAddress,
//         governanceAddress,
//         treasuryAddress,
//         isIntegrated,
//       };

//       // If integrated, add multisig and vault info
//       if (isIntegrated) {
//         const multisigResult =
//           MultisigService.getMultisigForRealm(realmAddress);

//         if (multisigResult.success && multisigResult.data) {
//           daoData.multisigAddress = multisigResult.data;

//           // Get multisig info to verify it exists
//           const multisigInfoResult = await MultisigService.getMultisigInfo(
//             connection,
//             multisigResult.data
//           );

//           if (multisigInfoResult.success && multisigInfoResult.data) {
//             // Get vault address
//             const vaultResult = MultisigService.getMultisigVaultPda(
//               multisigResult.data
//             );

//             if (vaultResult.success && vaultResult.data) {
//               daoData.vaultAddress = vaultResult.data;

//               // Get balances if possible
//               try {
//                 daoData.treasuryBalance =
//                   (await connection.getBalance(treasuryAddress)) / 1e9;
//                 daoData.vaultBalance =
//                   (await connection.getBalance(daoData.vaultAddress)) / 1e9;
//               } catch (error) {
//                 // Ignore balance fetch errors
//               }
//             }
//           }
//         }
//       } else {
//         // For non-integrated DAOs, just get the treasury balance
//         try {
//           daoData.treasuryBalance =
//             (await connection.getBalance(treasuryAddress)) / 1e9;
//         } catch (error) {
//           // Ignore balance fetch errors
//         }
//       }

//       return {
//         success: true,
//         data: daoData,
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to get realm information",
//           details: error,
//         },
//       };
//     }
//   }

//   static getRealmPublicKeyFromName(
//     connection: Connection,
//     name: string
//   ): PublicKey {
//     return new SplGovernance(
//       connection,
//       this.programId
//     ).pda.realmAccount({ name }).publicKey;
//   }

//   /*
//    * Intialize a namespace dao
//    */
//   static async initializeNamespaceDao(
//     connection: Connection,
//     keypair: Keypair,
//     name: string,
//     communityMint: PublicKey,
//     members: PublicKey[],
//     councilMint?: PublicKey // Some orgs may already have a council mint
//   ): Promise<
//     ServiceResponse<{
//       realmAddress: PublicKey;
//       transactionSignature: string;
//     }>
//   > {
//     try {
//       if (!councilMint)
//         councilMint = await createMint(
//           connection,
//           keypair,
//           keypair.publicKey,
//           null,
//           0
//         );

//       const splGovernance = new SplGovernance(connection, this.programId);
//       const instructions: TransactionInstruction[] = [];
//       const realmId = splGovernance.pda.realmAccount({ name }).publicKey;
//       const createRealmIx = await splGovernance.createRealmInstruction(
//         name,
//         communityMint,
//         // := NO community holder can greate a governance
//         DISABLED_VOTER_WEIGHT,
//         keypair.publicKey,
//         undefined,
//         councilMint,
//         "liquid", // Tradable tokens for community
//         "membership"
//       );
//       instructions.push(createRealmIx);
//       // Initial members of the project/orgs
//       for (const member of members) {
//         // Create token owner record
//         const createTokenOwnerRecordIx =
//           await splGovernance.createTokenOwnerRecordInstruction(
//             realmId,
//             member,
//             councilMint,
//             keypair.publicKey
//           );

//         // Deposit governance tokens
//         const depositGovTokenIx =
//           await splGovernance.depositGoverningTokensInstruction(
//             realmId,
//             councilMint,
//             councilMint,
//             member,
//             keypair.publicKey,
//             keypair.publicKey,
//             1
//           );
//         // Adjust signer flags
//         if (!member.equals(keypair.publicKey)) {
//           depositGovTokenIx.keys.forEach((key) => {
//             if (key.pubkey.equals(member) && key.isSigner) {
//               key.isSigner = false;
//             }
//           });
//         }
//         instructions.push(createTokenOwnerRecordIx, depositGovTokenIx);
//       }

//       // Process instructions
//       const txRes = await sendTx(connection, keypair, instructions);
//       if (!txRes.success || !txRes.data)
//         return {
//           success: false,
//           error: {
//             message: "Failed to initialize DAO",
//             details: txRes.error,
//           },
//         };

//       return {
//         success: true,
//         data: {
//           realmAddress: realmId,
//           transactionSignature: txRes.data,
//         },
//       };
//     } catch (err) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to initialize namespace DAO",
//           details: err,
//         },
//       };
//     }
//   }
//   /**
//    * Initialize a DAO with governance and token setup
//    */
//   static async initializeDAO(
//     connection: Connection,
//     keypair: Keypair,
//     name: string,
//     members: PublicKey[],
//     threshold: number
//   ): Promise<
//     ServiceResponse<{
//       realmAddress: PublicKey;
//       governanceAddress: PublicKey;
//       treasuryAddress: PublicKey;
//       communityMint: PublicKey;
//       councilMint: PublicKey;
//       transactionSignature: string;
//     }>
//   > {
//     try {
//       const instructions: TransactionInstruction[] = [];
//       const splGovernance = new SplGovernance(connection, this.programId);

//       // Create token mints
//       const communityMint = await createMint(
//         connection,
//         keypair,
//         keypair.publicKey,
//         null,
//         0
//       );

//       const councilMint = await createMint(
//         connection,
//         keypair,
//         keypair.publicKey,
//         null,
//         0
//       );

//       // Calculate PDAs
//       const realmId = splGovernance.pda.realmAccount({ name }).publicKey;
//       const governanceId = splGovernance.pda.governanceAccount({
//         realmAccount: realmId,
//         seed: realmId,
//       }).publicKey;
//       const nativeTreasuryId = splGovernance.pda.nativeTreasuryAccount({
//         governanceAccount: governanceId,
//       }).publicKey;

//       // 1. Create realm instruction
//       const createRealmIx = await splGovernance.createRealmInstruction(
//         name,
//         communityMint,
//         DISABLED_VOTER_WEIGHT,
//         keypair.publicKey,
//         undefined,
//         councilMint,
//         "dormant",
//         "membership"
//       );

//       instructions.push(createRealmIx);

//       // 2. Process members
//       for (const member of members) {
//         // Create token owner record
//         const createTokenOwnerRecordIx =
//           await splGovernance.createTokenOwnerRecordInstruction(
//             realmId,
//             member,
//             councilMint,
//             keypair.publicKey
//           );

//         // Deposit governance tokens
//         const depositGovTokenIx =
//           await splGovernance.depositGoverningTokensInstruction(
//             realmId,
//             councilMint,
//             councilMint,
//             member,
//             keypair.publicKey,
//             keypair.publicKey,
//             1
//           );
//         // Adjust signer flags
//         if (!member.equals(keypair.publicKey)) {
//           depositGovTokenIx.keys.forEach((key) => {
//             if (key.pubkey.equals(member) && key.isSigner) {
//               key.isSigner = false;
//             }
//           });
//         }

//         instructions.push(createTokenOwnerRecordIx, depositGovTokenIx);
//       }

//       // 3. Create governance
//       const thresholdPercentage = Math.floor(
//         (threshold / members.length) * 100
//       );

//       const governanceConfig: GovernanceConfig = {
//         communityVoteThreshold: { disabled: {} },
//         minCommunityWeightToCreateProposal: DISABLED_VOTER_WEIGHT,
//         minTransactionHoldUpTime: 0,
//         votingBaseTime: DEFAULT_VOTING_TIME,
//         communityVoteTipping: { disabled: {} },
//         councilVoteThreshold: {
//           yesVotePercentage: [thresholdPercentage],
//         },
//         councilVetoVoteThreshold: { disabled: {} },
//         minCouncilWeightToCreateProposal: 1,
//         councilVoteTipping: { early: {} },
//         communityVetoVoteThreshold: { disabled: {} },
//         votingCoolOffTime: 0,
//         depositExemptProposalCount: 254,
//       };

//       const createGovernanceIx =
//         await splGovernance.createGovernanceInstruction(
//           governanceConfig,
//           realmId,
//           keypair.publicKey,
//           undefined,
//           keypair.publicKey,
//           realmId
//         );
//       instructions.push(createGovernanceIx);

//       // 4. Setup treasury and finalize
//       const createNativeTreasuryIx =
//         await splGovernance.createNativeTreasuryInstruction(
//           governanceId,
//           keypair.publicKey
//         );

//       const transferCommunityAuthIx = createSetAuthorityInstruction(
//         communityMint,
//         keypair.publicKey,
//         AuthorityType.MintTokens,
//         nativeTreasuryId
//       );

//       const transferCouncilAuthIx = createSetAuthorityInstruction(
//         councilMint,
//         keypair.publicKey,
//         AuthorityType.MintTokens,
//         nativeTreasuryId
//       );

//       const transferMultisigAuthIx =
//         await splGovernance.setRealmAuthorityInstruction(
//           realmId,
//           keypair.publicKey,
//           "setChecked",
//           governanceId
//         );

//       instructions.push(
//         createNativeTreasuryIx,
//         transferCommunityAuthIx,
//         transferCouncilAuthIx,
//         transferMultisigAuthIx
//       );

//       // Execute all instructions
//       const txRes = await sendTx(connection, keypair, instructions);
//       if (!txRes.success || !txRes.data)
//         return {
//           success: false,
//           error: {
//             message: "Failed to initialize DAO",
//             details: txRes.error,
//           },
//         };

//       return {
//         success: true,
//         data: {
//           realmAddress: realmId,
//           governanceAddress: governanceId,
//           treasuryAddress: nativeTreasuryId,
//           communityMint,
//           councilMint,
//           transactionSignature: txRes.data,
//         },
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to initialize DAO",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Intialize DAO and integrate with multisig
//    */
//   static async initializeIntegratedDAO(
//     connection: Connection,
//     keypair: Keypair,
//     name: string,
//     members: PublicKey[],
//     threshold: number
//   ): Promise<
//     ServiceResponse<{
//       realmAddress: PublicKey;
//       governanceAddress: PublicKey;
//       treasuryAddress: PublicKey;
//       communityMint: PublicKey;
//       councilMint: PublicKey;
//       multisigAddress: PublicKey;
//       daoTransaction: string;
//       squadsTransaction: string;
//     }>
//   > {
//     const daoRes = await this.initializeDAO(
//       connection,
//       keypair,
//       name,
//       members,
//       threshold
//     );
//     if (!daoRes.success || !daoRes.data)
//       return {
//         success: false,
//         error: {
//           message: "Failed to initialize DAO",
//           details: daoRes.error,
//         },
//       };
//     const sqdsMultisigRes = await MultisigService.createDaoControlledMultisig(
//       connection,
//       keypair,
//       threshold,
//       members,
//       `${name}-multisig`,
//       daoRes.data.realmAddress
//     );
//     if (!sqdsMultisigRes.success || !sqdsMultisigRes.data)
//       return {
//         success: false,
//         error: {
//           message: "Failed to create multisig",
//           details: sqdsMultisigRes.error,
//         },
//       };
//     const result = {
//       realmAddress: daoRes.data.realmAddress,
//       governanceAddress: daoRes.data.governanceAddress,
//       treasuryAddress: daoRes.data.treasuryAddress,
//       communityMint: daoRes.data.communityMint,
//       councilMint: daoRes.data.councilMint,
//       multisigAddress: sqdsMultisigRes.data.multisigPda,
//       daoTransaction: daoRes.data.transactionSignature,
//       squadsTransaction: sqdsMultisigRes.data.transactionSignature,
//     };
//     return { success: true, data: result };
//   }

//   /**
//    * Gets proposals for a realm
//    */
//   static async getProposalsForRealm(
//     connection: Connection,
//     realmAddress: PublicKey
//   ): Promise<
//     ServiceResponse<{
//       proposals: ProposalV2[];
//       governanceId: PublicKey;
//     }>
//   > {
//     try {
//       const splGovernance = new SplGovernance(connection, this.programId);

//       const governanceId = splGovernance.pda.governanceAccount({
//         realmAccount: realmAddress,
//         seed: realmAddress,
//       }).publicKey;

//       const allProposals = await splGovernance.getAllProposals();
//       const filteredProposals = allProposals.filter((proposal) =>
//         proposal.governance.equals(governanceId)
//       );

//       return {
//         success: true,
//         data: {
//           proposals: filteredProposals,
//           governanceId,
//         },
//       };
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to get proposals for realm",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Get the program ID for SPL Governance
//    */
//   static getProgramId(): PublicKey {
//     return this.programId;
//   }

//   /**
//    * Fund either the native DAO treasury or the Squads multisig
//    * @param connection Solana connection
//    * @param keypair Wallet keypair
//    * @param targetAddress The treasury or multisig address to fund
//    * @param amount Amount of SOL to transfer
//    * @returns Transaction signature
//    */
//   static async fundTreasury(
//     connection: Connection,
//     keypair: Keypair,
//     targetAddress: PublicKey,
//     amount: number
//   ): Promise<ServiceResponse<string>> {
//     try {
//       // Create transfer instruction
//       const transferIx = SystemProgram.transfer({
//         fromPubkey: keypair.publicKey,
//         toPubkey: targetAddress,
//         lamports: amount * LAMPORTS_PER_SOL,
//       });

//       // Execute the transaction
//       return await sendTx(connection, keypair, [transferIx]);
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to fund treasury",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Fund a token account for a recipient
//    * @param connection Solana connection
//    * @param keypair Wallet keypair
//    * @param tokenMint Token mint address
//    * @param recipient Recipient address
//    * @param amount Amount of tokens to transfer (decimal)
//    * @returns Transaction signature
//    */
//   static async fundTokenAccount(
//     connection: Connection,
//     keypair: Keypair,
//     tokenMint: PublicKey,
//     recipient: PublicKey,
//     amount: number
//   ): Promise<ServiceResponse<string>> {
//     try {
//       // Get token info for decimals
//       const tokenInfo = await getMint(connection, tokenMint);

//       // Find source token account
//       const sourceAccounts = await connection.getParsedTokenAccountsByOwner(
//         keypair.publicKey,
//         { mint: tokenMint }
//       );

//       if (!sourceAccounts.value || sourceAccounts.value.length === 0) {
//         return {
//           success: false,
//           error: {
//             message: `No token accounts found for mint ${tokenMint.toBase58()}`,
//           },
//         };
//       }

//       // Use the first account that has enough tokens
//       const sourceAccount = sourceAccounts.value[0].pubkey;

//       // Calculate the destination token account (ATA)
//       const destinationAccount = getAssociatedTokenAddressSync(
//         tokenMint,
//         recipient,
//         true // Allow PDA owners
//       );

//       // Check if destination account exists
//       const instructions: TransactionInstruction[] = [];
//       const destinationAccountInfo = await connection.getAccountInfo(
//         destinationAccount
//       );

//       // Create destination account if needed
//       if (!destinationAccountInfo) {
//         instructions.push(
//           createAssociatedTokenAccountInstruction(
//             keypair.publicKey,
//             destinationAccount,
//             recipient,
//             tokenMint
//           )
//         );
//       }

//       // Calculate token amount with decimals
//       const adjustedAmount = amount * Math.pow(10, tokenInfo.decimals);

//       // Add transfer instruction
//       instructions.push(
//         createTransferInstruction(
//           sourceAccount,
//           destinationAccount,
//           keypair.publicKey,
//           Math.floor(adjustedAmount)
//         )
//       );

//       // Execute instructions
//       return await sendTx(connection, keypair, instructions);
//     } catch (error) {
//       return {
//         success: false,
//         error: {
//           message: "Failed to fund token account",
//           details: error,
//         },
//       };
//     }
//   }

//   /**
//    * Get all token owner record for a given publickey
//    */
//   static async getTokenOwnerRecords(
//     connection: Connection,
//     owner: Keypair
//   ): Promise<
//     ServiceResponse<
//       {
//         realmAddress: PublicKey;
//         isIntegrated: boolean;
//         tokenOwnerRecords: TokenOwnerRecord;
//       }[]
//     >
//   > {
//     const splGovernance = new SplGovernance(connection, this.programId);
//     const tokenOwnerRecords = await splGovernance.getTokenOwnerRecordsForOwner(
//       owner.publicKey
//     );
//     const result = [];
//     for (const tokenOwnerRecord of tokenOwnerRecords) {
//       const realmAddress = tokenOwnerRecord.realm;
//       const isIntegrated = await this.isIntegratedDao(connection, realmAddress);
//       result.push({
//         realmAddress,
//         isIntegrated: isIntegrated.data!,
//         tokenOwnerRecords: tokenOwnerRecord,
//       });
//     }
//     return { success: true, data: result };
//   }
// }
