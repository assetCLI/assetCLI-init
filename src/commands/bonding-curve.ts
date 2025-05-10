/*
 ** This is an implementation for a standalone bonding curve
 */

import chalk from "chalk";
import { Command } from "commander";
import { ConnectionService } from "../services/connection-service";
import { WalletService } from "../services/wallet-service";
import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { BondingCurveService } from "../services/bonding-curve-service";
import { Idl, Wallet } from "@coral-xyz/anchor";

import * as IDL from "../../idls/bonding_curve.json";
import { getExplorerTx } from "../utils/get-explorer-tx";

export function registerBondingCurveCommands(program: Command) {
  const bondingCurveCommand = program
    .command("bonding-curve")
    .description("Bonding curve commands");

  // Only done once, to initialize teh global states
  bondingCurveCommand
    .command("init")
    .description("Initialize a bonding curve")
    .option(
      "-mf, --migrate-fee-amount <number>",
      "Migrate fee amount",
      (value: string) => new BN(value),
      new BN(1)
    )
    .option(
      "-fr, --fee-receiver <string>",
      "Fee receiver address",
      (value: string) => new PublicKey(value),
      new PublicKey("CKQ2RjrKGZMpntnC5Tbvx1Ac7uvXYbnW19AG4Y7G9JpT") // Replace with a valid address
    )
    .option(
      "-s, --status <status>",
      "Status of the bonding curve",
      (value: string) => {
        switch (value) {
          case "running":
            return { running: {} };
          case "swapOnly":
            return { swapOnly: {} };
          case "swapOnlyNoLaunch":
            return { swapOnlyNoLaunch: {} };
          case "paused":
            return { paused: {} };
          default:
            throw new Error("Invalid status");
        }
      },
      { running: {} }
    )
    .action(async (options) => {
      try {
        // Load wallet and connection
        const walletRes = await WalletService.loadWallet();
        if (!walletRes.success || !walletRes.data) {
          console.log(
            chalk.red("No wallet configured. Please create a wallet first.")
          );
          return;
        }

        const connectionRes = await ConnectionService.getConnection();
        if (!connectionRes.success || !connectionRes.data) {
          console.log(chalk.red("Failed to establish connection"));
          return;
        }

        const connection = connectionRes.data;
        const keypair = WalletService.getKeypair(walletRes.data);
        const bondingCurveSerice = new BondingCurveService(
          connection,
          new Wallet(keypair),
          "confirmed",
          IDL as Idl
        );
        const tx = await bondingCurveSerice.initialize({
          migrateFeeAmount: options.migrateFeeAmount,
          feeReceiver: options.feeReceiver,
          status: options.status,
        });

        if (!tx.success || !tx.data) {
          console.log(chalk.red("Failed to initialize bonding curve"));
          console.log(chalk.red(tx.error?.message));
          console.log(chalk.red("Transaction signature: "), tx.error?.details);
          return;
        }
        console.log(chalk.green("Bonding curve initialized successfully!"));
        const globalState = await bondingCurveSerice.getGlobalSettings();
        console.log(
          chalk.green("Global settings:"),
          JSON.stringify(globalState.data, null, 2)
        );
        // const cluster = await ConnectionService.getCluster();
        console.log(
          chalk.blue(
            `Transaction signature: ${tx.data}}`
          )
        );
      } catch (error) {
        console.error(chalk.red("Failed to initialize bonding curve:"), error);
      }
    });
}
