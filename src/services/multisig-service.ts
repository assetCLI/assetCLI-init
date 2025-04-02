import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  Transaction,
  TransactionMessage,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { KeypairUtil } from "../utils/keypair-util";
import { sendTx } from "../utils/send_tx";
import { ServiceResponse, MultisigData } from "../types/service-types";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getMint,
} from "@solana/spl-token";

export interface MultisigTransactionResult {
  transactionIndex: number;
  multisigPda: PublicKey;
}

export class MultisigService {
  /**
   * Creates a standalone Squads multisig
   */
  static async createMultisig(
    connection: Connection,
    keypair: Keypair,
    threshold: number,
    members: PublicKey[],
    name: string,
    createKey: Keypair
  ): Promise<
    ServiceResponse<{
      multisigPda: PublicKey;
      transactionSignature: string;
    }>
  > {
    try {
      // Calculate the multisig PDA
      const [multisigPda] = multisig.getMultisigPda({
        createKey: createKey.publicKey,
      });

      // Get program config for fee payments
      const programConfigPda = multisig.getProgramConfigPda({})[0];

      try {
        const programConfig =
          await multisig.accounts.ProgramConfig.fromAccountAddress(
            connection,
            programConfigPda
          );

        const configTreasury = programConfig.treasury;

        // Create the multisig transaction
        const ix = multisig.instructions.multisigCreateV2({
          createKey: createKey.publicKey,
          creator: keypair.publicKey,
          multisigPda,
          configAuthority: null,
          timeLock: 0,
          members: members.map((m) => ({
            key: m,
            permissions: multisig.types.Permissions.all(),
          })),
          threshold: threshold,
          treasury: configTreasury,
          memo: name,
          rentCollector: keypair.publicKey, // Use the creator as the rent collector
        });

        // Use the transaction helper to create and submit the transaction
        const tx = new Transaction().add(ix);
        tx.feePayer = keypair.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.sign(...[keypair, createKey]);

        const res = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(res);

        return {
          success: true,
          data: { multisigPda, transactionSignature: res },
        };
      } catch (error) {
        return {
          success: false,
          error: {
            message: "Error fetching program config",
            details: error,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to create multisig",
          details: error,
        },
      };
    }
  }

  /**
   * Creates a Squads multisig controlled by a DAO governance account
   * Uses a deterministic approach based on the realm address
   */
  static async createDaoControlledMultisig(
    connection: Connection,
    keypair: Keypair,
    threshold: number,
    members: PublicKey[],
    name: string,
    realmAddress: PublicKey
  ): Promise<
    ServiceResponse<{ multisigPda: PublicKey; transactionSignature: string }>
  > {
    try {
      // Generate a deterministic keypair based on the realm address
      // If treasury is provided, use it for even more determinism
      const derivedKeypair = KeypairUtil.getRealmDerivedKeypair(realmAddress);

      // Use the derived keypair as createKey
      const [multisigPda] = multisig.getMultisigPda({
        createKey: derivedKeypair.publicKey,
      });
      // Store realm address in the memo for easier on-chain querying if needed
      const realmPrefix = "realm:";
      const memo = `${realmPrefix}${realmAddress.toBase58()}-${name}`;

      const multisigResult = await this.createMultisig(
        connection,
        keypair,
        threshold,
        members,
        memo,
        derivedKeypair
      );

      if (!multisigResult.success || !multisigResult.data) {
        return multisigResult;
      }

      const multisigPdaExecuted = multisigResult.data.multisigPda;

      if (!multisigPdaExecuted.equals(multisigPda)) {
        return {
          success: false,
          error: {
            message: "Multisig PDA mismatch",
          },
        };
      }

      return {
        success: true,
        data: {
          multisigPda,
          transactionSignature: multisigResult.data.transactionSignature,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to create DAO-controlled multisig",
          details: error,
        },
      };
    }
  }

  /*
   Get the multisig vault pda for a given multisig
  */
  static getMultisigVaultPda(
    multisigPda: PublicKey
  ): ServiceResponse<PublicKey> {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });

    return {
      success: true,
      data: vaultPda,
    };
  }

  /**
   * Creates an instruction for transferring SOL from a multisig vault
   */
  static async getSquadsMultisigSolTransferInstruction(
    connection: Connection,
    multisigAddress: PublicKey,
    amount: number | bigint,
    recipientAddress: PublicKey
  ): Promise<ServiceResponse<TransactionInstruction>> {
    try {
      // Get the Squads vault PDA for index 0
      const vaultPda = this.getMultisigVaultPda(multisigAddress).data!;

      // Calculate lamports
      const lamports =
        typeof amount === "number"
          ? amount * LAMPORTS_PER_SOL
          : amount * BigInt(LAMPORTS_PER_SOL);

      // Create the inner transfer instruction that will be executed by the vault
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: vaultPda,
        toPubkey: recipientAddress,
        lamports: typeof lamports === "bigint" ? Number(lamports) : lamports,
      });

      return {
        success: true,
        data: transferInstruction,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to create multisig SOL transfer instruction",
          details: error,
        },
      };
    }
  }

  /**
   * Creates an instruction for transferring token from a multisig vault
   */
  static async getSquadsMultisigTokenTransferInstruction(
    connection: Connection,
    multisigAddress: PublicKey,
    amount: number | bigint,
    recipientAddress: PublicKey,
    mintAddress: PublicKey
  ): Promise<ServiceResponse<TransactionInstruction[]>> {
    try {
      // Get the Squads vault PDA for index 0
      const vaultPdaResult = this.getMultisigVaultPda(multisigAddress);
      if (!vaultPdaResult.success) {
        return {
          success: false,
          error: vaultPdaResult.error ?? {
            message: "Failed to get multisig vault PDA",
          },
        };
      }
      const vaultPda = vaultPdaResult.data!;

      // Get token info for decimals
      const tokenInfo = await getMint(connection, mintAddress);

      // Calculate transfer amount with decimals
      const adjustedAmount =
        typeof amount === "number"
          ? amount * Math.pow(10, tokenInfo.decimals)
          : amount * BigInt(Math.pow(10, tokenInfo.decimals));

      // Source token account is the vault's associated token account
      const sourceTokenAccount = getAssociatedTokenAddressSync(
        mintAddress,
        vaultPda,
        true // Allow PDA owners
      );

      // Destination is the recipient's associated token account
      const recipientTokenAccount = getAssociatedTokenAddressSync(
        mintAddress,
        recipientAddress,
        false
      );

      // Create instructions array
      const instructions: TransactionInstruction[] = [];

      // Check if recipient token account exists
      const recipientAccountInfo = await connection.getAccountInfo(
        recipientTokenAccount
      );

      // If recipient account doesn't exist, add instruction to create it
      if (!recipientAccountInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            vaultPda, // payer (the vault will pay during execution)
            recipientTokenAccount,
            recipientAddress,
            mintAddress
          )
        );
      }

      // Add transfer instruction
      instructions.push(
        createTransferInstruction(
          sourceTokenAccount,
          recipientTokenAccount,
          vaultPda, // authority (the vault is the owner of the token account)
          typeof adjustedAmount === "bigint"
            ? Number(adjustedAmount)
            : Math.floor(adjustedAmount)
        )
      );

      return {
        success: true,
        data: instructions,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to create multisig token transfer instruction",
          details: error,
        },
      };
    }
  }

  /**
   * Approves a multisig proposal as part of DAO voting
   */
  static async voteSynchronized(
    connection: Connection,
    keypair: Keypair,
    multisigPda: PublicKey,
    transactionIndex: number,
    approve: boolean
  ): Promise<ServiceResponse<string | undefined>> {
    try {
      if (!approve) {
        return {
          success: true,
          data: undefined,
        };
      }
      // Create approval instruction
      const ix = multisig.instructions.proposalApprove({
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
        member: keypair.publicKey,
      });
      // Execute the transaction
      const txResult = await sendTx(connection, keypair, [ix]);

      if (!txResult.success) {
        return txResult;
      }

      return {
        success: true,
        data: txResult.data,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to synchronize approval",
          details: error,
        },
      };
    }
  }

  /**
   * Checks if a multisig proposal is ready for execution (threshold met)
   */
  static async isProposalReadyToExecute(
    connection: Connection,
    multisigPda: PublicKey,
    transactionIndex: number
  ): Promise<ServiceResponse<boolean>> {
    try {
      // Get the proposal account
      const [proposalPda] = multisig.getProposalPda({
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
      });

      const proposal = await multisig.accounts.Proposal.fromAccountAddress(
        connection,
        proposalPda
      );

      // Get the multisig account to check threshold
      const multisigAccount =
        await multisig.accounts.Multisig.fromAccountAddress(
          connection,
          multisigPda
        );

      const approvalCount = proposal.approved.length;
      const threshold = multisigAccount.threshold;
      return {
        success: true,
        data: approvalCount >= threshold,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to check proposal execution readiness",
          details: error,
        },
      };
    }
  }

  /**
   * Creates a transaction to transfer SOL from a multisig vault to a recipient
   */
  static async createMultisigTransaction(
    connection: Connection,
    multisigPda: PublicKey,
    keypair: Keypair,
    instructions: TransactionInstruction[],
    title: string
  ): Promise<ServiceResponse<BigInt>> {
    try {
      const vaultPdaResult = this.getMultisigVaultPda(multisigPda);
      if (!vaultPdaResult.success) {
        return {
          success: false,
          error: vaultPdaResult.error ?? {
            message: "Failed to get multisig vault PDA",
          },
        };
      }

      const vaultPda = vaultPdaResult.data!;

      // Get multisig info
      const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPda
      );

      const currentTransactionIndex = Number(multisigInfo.transactionIndex);
      const newTransactionIndex = BigInt(currentTransactionIndex + 1);

      // Create transaction message with the provided instructions
      const transactionMessage = new TransactionMessage({
        payerKey: vaultPda, // The vault is the payer for the inner transaction
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions,
      });

      const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
        multisigPda: multisigPda,
        transactionIndex: newTransactionIndex,
        creator: keypair.publicKey,
        vaultIndex: 0,
        ephemeralSigners: 0,
        transactionMessage,
        memo: `Proposal: ${title}`,
      });

      // Execute the transaction
      const txResult = await sendTx(connection, keypair, [createVaultTxIx]);

      if (!txResult.success) {
        return {
          success: false,
          error: txResult.error ?? {
            message: "Failed to create multisig transaction",
          },
        };
      }

      return {
        success: true,
        data: newTransactionIndex,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to create multisig transaction",
          details: error,
        },
      };
    }
  }

  /**
   * Creates a proposal for an existing multisig transaction
   */
  static async createProposalForTransaction(
    connection: Connection,
    keypair: Keypair,
    multisigPda: PublicKey,
    transactionIndex: number
  ): Promise<ServiceResponse<string>> {
    try {
      // Create proposal instruction
      const ix = multisig.instructions.proposalCreate({
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
        creator: keypair.publicKey,
      });

      // Execute the transaction
      return await sendTx(connection, keypair, [ix]);
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to create proposal for transaction",
          details: error,
        },
      };
    }
  }

  /**
   * Creates a complete transaction with proposal in one operation
   * This combines createMultisigTransaction and createProposalForTransaction
   */
  static async createTransactionWithProposal(
    connection: Connection,
    multisigPda: PublicKey,
    keypair: Keypair,
    instructions: TransactionInstruction[],
    title: string
  ): Promise<ServiceResponse<MultisigTransactionResult>> {
    try {
      // First create the transaction
      const txResult = await this.createMultisigTransaction(
        connection,
        multisigPda,
        keypair,
        instructions,
        title
      );

      if (!txResult.success) {
        return {
          success: false,
          error: txResult.error ?? {
            message: "Unable to create Multisig transaction",
          },
        };
      }

      const transactionIndex = Number(txResult.data!);

      // Then create the proposal
      const proposalResult = await this.createProposalForTransaction(
        connection,
        keypair,
        multisigPda,
        transactionIndex
      );

      if (!proposalResult.success) {
        return {
          success: false,
          error: {
            message: "Created transaction but failed to create proposal",
            details: proposalResult.error,
          },
        };
      }
      return {
        success: true,
        data: {
          transactionIndex,
          multisigPda,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to create transaction with proposal",
          details: error,
        },
      };
    }
  }

  /**
   * Approves a multisig proposal
   */
  static async approveProposal(
    connection: Connection,
    keypair: Keypair,
    multisigPda: PublicKey,
    transactionIndex: number
  ): Promise<ServiceResponse<string>> {
    try {
      // First check if the proposal exists
      const [proposalPda] = multisig.getProposalPda({
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
      });

      try {
        // Try to fetch the proposal to see if it exists
        const proposal = await multisig.accounts.Proposal.fromAccountAddress(
          connection,
          proposalPda
        );
        // Check if the user already approved this proposal
        const alreadyApproved = proposal.approved.some((approver) =>
          approver.equals(keypair.publicKey)
        );
        if (alreadyApproved) {
          return {
            success: true,
            data: "Already approved",
          };
        }
        // Get multisig account to check membership
        const multisigAccount =
          await multisig.accounts.Multisig.fromAccountAddress(
            connection,
            multisigPda
          );

        // Check if the keypair is a member
        const isMember = multisigAccount.members.some((m) =>
          m.key.equals(keypair.publicKey)
        );

        if (!isMember) {
          return {
            success: false,
            error: {
              message: "User is not a member of the multisig",
            },
          };
        }
      } catch (e) {
        return {
          success: false,
          error: {
            message: "Proposal doesn't exist",
          },
        };
      }

      // Create approval instruction
      const ix = multisig.instructions.proposalApprove({
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
        member: keypair.publicKey,
      });

      // Create and send transaction
      return await sendTx(connection, keypair, [ix]);
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to approve proposal",
          details: error,
        },
      };
    }
  }

  /**
   * Rejects a multisig proposal
   */
  static async rejectProposal(
    connection: Connection,
    keypair: Keypair,
    multisigPda: PublicKey,
    transactionIndex: number
  ): Promise<ServiceResponse<string>> {
    try {
      // First check if the proposal exists
      const [proposalPda] = multisig.getProposalPda({
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
      });
      try {
        // Try to fetch the proposal to see if it exists
        const proposal = await multisig.accounts.Proposal.fromAccountAddress(
          connection,
          proposalPda
        );
        // Check if the user already rejected this proposal
        const alreadyRejected = proposal.rejected.some((rejector) =>
          rejector.equals(keypair.publicKey)
        );
        if (alreadyRejected) {
          return {
            success: true,
            data: "Already rejected",
          };
        }
        // Get multisig account to check membership
        const multisigAccount =
          await multisig.accounts.Multisig.fromAccountAddress(
            connection,
            multisigPda
          );

        // Check if the keypair is a member
        const isMember = multisigAccount.members.some((m) =>
          m.key.equals(keypair.publicKey)
        );
        if (!isMember) {
          return {
            success: false,
            error: {
              message: "User is not a member of the multisig",
            },
          };
        }
      } catch (e) {
        return {
          success: false,
          error: {
            message: "Proposal doesn't exist",
          },
        };
      }
      // Create rejection instruction
      // Create approval instruction
      const ix = multisig.instructions.proposalReject({
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
        member: keypair.publicKey,
      });

      // Create and send transaction
      return await sendTx(connection, keypair, [ix]);
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to reject proposal",
          details: error,
        },
      };
    }
  }

  /**
   * Executes an approved multisig transaction
   */
  static async executeMultisigTransaction(
    connection: Connection,
    keypair: Keypair,
    multisigPda: PublicKey,
    transactionIndex: number
  ): Promise<ServiceResponse<string>> {
    try {
      // Get fresh multisig info
      const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPda
      );

      // Create execute instruction
      const ix = await multisig.instructions.vaultTransactionExecute({
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
        member: keypair.publicKey,
        connection,
      });

      // Execute the transaction
      return await sendTx(connection, keypair, [ix.instruction]);
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to execute multisig transaction",
          details: error,
        },
      };
    }
  }

  /**
   * Finds the multisig associated with a realm address
   * Uses the same deterministic derivation as createDaoControlledMultisig
   */
  static getMultisigForRealm(
    realmAddress: PublicKey
  ): ServiceResponse<PublicKey> {
    try {
      const multisigPda =
        KeypairUtil.getRealmAssociatedMultisigAddress(realmAddress);

      return {
        success: true,
        data: multisigPda,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to get multisig for realm",
          details: error,
        },
      };
    }
  }

  /**
   * Get proposal status and whether it meets threshold
   */
  static async getProposalStatus(
    connection: Connection,
    multisigPda: PublicKey,
    transactionIndex: number
  ): Promise<
    ServiceResponse<{
      exists: boolean;
      approvalCount: number;
      threshold: number;
      meetsThreshold: boolean;
    }>
  > {
    try {
      // Get the multisig account to check threshold
      const multisigAccount =
        await multisig.accounts.Multisig.fromAccountAddress(
          connection,
          multisigPda
        );

      const threshold = multisigAccount.threshold;

      // Get the proposal account
      const [proposalPda] = multisig.getProposalPda({
        multisigPda,
        transactionIndex: BigInt(transactionIndex),
      });

      try {
        const proposal = await multisig.accounts.Proposal.fromAccountAddress(
          connection,
          proposalPda
        );

        const approvalCount = proposal.approved.length;
        const meetsThreshold = approvalCount >= threshold;

        return {
          success: true,
          data: {
            exists: true,
            approvalCount,
            threshold,
            meetsThreshold,
          },
        };
      } catch {
        // Proposal doesn't exist yet
        return {
          success: true,
          data: {
            exists: false,
            approvalCount: 0,
            threshold,
            meetsThreshold: false,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to check proposal status",
          details: error,
        },
      };
    }
  }

  /**
   * Gets information about a multisig account
   */
  static async getMultisigInfo(
    connection: Connection,
    multisigPda: PublicKey
  ): Promise<ServiceResponse<MultisigData>> {
    try {
      const multisigAccount =
        await multisig.accounts.Multisig.fromAccountAddress(
          connection,
          multisigPda
        );

      return {
        success: true,
        data: {
          threshold: multisigAccount.threshold,
          memberCount: multisigAccount.members.length,
          transactionIndex: Number(multisigAccount.transactionIndex),
          members: multisigAccount.members.map((m) => m.key),
          multisigPda,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to get multisig info",
          details: error,
        },
      };
    }
  }

  /**
   * Funds a multisig vault with SOL
   */
  static async fundSolanaToMultisig(
    connection: Connection,
    keypair: Keypair,
    multisigAddress: PublicKey,
    amount: number
  ): Promise<ServiceResponse<string>> {
    try {
      // Get the vault PDA of the multisig
      const vaultPdaResult = this.getMultisigVaultPda(multisigAddress);
      if (!vaultPdaResult.success) {
        return {
          success: false,
          error: vaultPdaResult.error ?? {
            message: "Failed to get multisig vault PDA",
          },
        };
      }

      const vaultPda = vaultPdaResult.data!;

      // Calculate lamports
      const lamports = amount * LAMPORTS_PER_SOL;

      // Create transfer instruction
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: vaultPda,
        lamports,
      });

      // Send the transaction
      return await sendTx(connection, keypair, [transferInstruction]);
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to fund multisig vault",
          details: error,
        },
      };
    }
  }

  /**
   * Fund a token account for a recipient
   * @param connection Solana connection
   * @param keypair Wallet keypair
   * @param tokenMint Token mint address
   * @param recipient Recipient address
   * @param amount Amount of tokens to transfer (decimal)
   * @returns Transaction signature
   */
  static async fundTokenAccount(
    connection: Connection,
    keypair: Keypair,
    tokenMint: PublicKey,
    recipient: PublicKey,
    amount: number
  ): Promise<ServiceResponse<string>> {
    try {
      // Get token info for decimals
      const tokenInfo = await getMint(connection, tokenMint);

      // Find source token account
      const sourceAccounts = await connection.getParsedTokenAccountsByOwner(
        keypair.publicKey,
        { mint: tokenMint }
      );

      if (!sourceAccounts.value || sourceAccounts.value.length === 0) {
        return {
          success: false,
          error: {
            message: `No token accounts found for mint ${tokenMint.toBase58()}`,
          },
        };
      }

      // Use the first account that has enough tokens
      const sourceAccount = sourceAccounts.value[0].pubkey;

      // Calculate the destination token account (ATA)
      const destinationAccount = getAssociatedTokenAddressSync(
        tokenMint,
        recipient,
        true // Allow PDA owners
      );

      // Check if destination account exists
      const instructions: TransactionInstruction[] = [];
      const destinationAccountInfo = await connection.getAccountInfo(
        destinationAccount
      );

      // Create destination account if needed
      if (!destinationAccountInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            keypair.publicKey,
            destinationAccount,
            recipient,
            tokenMint
          )
        );
      }

      // Calculate token amount with decimals
      const adjustedAmount = amount * Math.pow(10, tokenInfo.decimals);

      // Add transfer instruction
      instructions.push(
        createTransferInstruction(
          sourceAccount,
          destinationAccount,
          keypair.publicKey,
          Math.floor(adjustedAmount)
        )
      );

      // Execute instructions
      return await sendTx(connection, keypair, instructions);
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to fund token account",
          details: error,
        },
      };
    }
  }

  /**
   * Fetches all proposals for a multisig
   */
  static async getAllProposals(
    connection: Connection,
    multisigPda: PublicKey
  ): Promise<
    ServiceResponse<
      {
        proposal: multisig.accounts.Proposal | null;
        transactionIndex: bigint;
      }[]
    >
  > {
    try {
      // Get multisig info to determine the number of transactions
      const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPda
      );

      const totalTransactions = Number(multisigInfo.transactionIndex);

      // Create an array to hold all transaction indexes
      const transactionIndexes = Array.from(
        { length: totalTransactions },
        (_, i) => BigInt(i + 1) // Indexes start at 1
      );

      // Fetch all proposals in parallel
      const proposalResults = await Promise.all(
        transactionIndexes.map(async (index) => {
          const proposalPda = multisig.getProposalPda({
            multisigPda,
            transactionIndex: index,
          })[0];

          let proposal = null;
          try {
            proposal = await multisig.accounts.Proposal.fromAccountAddress(
              connection,
              proposalPda
            );
          } catch (error) {
            // Proposal might not exist, which is fine
          }

          return {
            proposal,
            transactionIndex: index,
          };
        })
      );

      return {
        success: true,
        data: proposalResults,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to fetch all proposals",
          details: error,
        },
      };
    }
  }
}
