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
import { GovernanceService } from "../services/governance-service";

export function registerBondingCurveCommands(program: Command) {
  const bondingCurveCommand = program
    .command("bonding-curve")
    .description("Bonding curve commands");

  // Only done once, to initialize teh global states
  bondingCurveCommand
    .command("init")
    .description("Initialize a bonding curve")
    .option(
      "-iv, --initial-virtual-token-reserves <number>",
      "Initial virtual token reserves",
      (value: string) => new BN(value),
      new BN(100_000_000_000_000)
    )
    .option(
      "-is, --initial-virtual-sol-reserves <number>",
      "Initial virtual SOL reserves",
      (value: string) => new BN(value),
      new BN(30_000_000_000)
    )
    .option(
      "-ir, --initial-real-token-reserves <number>",
      "Initial real token reserves",
      (value: string) => new BN(value),
      new BN(50_000_000_000_000)
    )
    .option(
      "-ts, --token-total-supply <number>",
      "Total supply of the token",
      (value: string) => new BN(value),
      new BN(100_000_000_000_000)
    )
    .option(
      "-md, --mint-decimals <number>",
      "Decimals for the mint",
      (value: string) => Number(value),
      6
    )
    .option(
      "-mf, --migrate-fee-amount <number>",
      "Migrate fee amount",
      (value: string) => new BN(value),
      new BN(500)
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
    .option(
      "-we, --whitelist-enabled <boolean>",
      "Enable whitelist",
      (value: string) => {
        if (value === "true") {
          return true;
        } else if (value === "false") {
          return false;
        } else {
          throw new Error("Invalid value for whitelist-enabled");
        }
      },
      false
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
          initialVirtualTokenReserves: options.initialVirtualTokenReserves,
          initialVirtualSolReserves: options.initialVirtualSolReserves,
          initialRealTokenReserves: options.initialRealTokenReserves,
          tokenTotalSupply: options.tokenTotalSupply,
          mintDecimals: options.mintDecimals,
          migrateFeeAmount: options.migrateFeeAmount,
          feeReceiver: options.feeReceiver,
          status: options.status,
          whitelistEnabled: options.whitelistEnabled,
        });

        if (!tx.success || !tx.data) {
          console.log(chalk.red("Failed to initialize bonding curve"));
          console.log(chalk.red(tx.error));
          return;
        }
        console.log(chalk.green("Bonding curve initialized successfully!"));
        const globalState = await bondingCurveSerice.getGlobalSettings();
        console.log(
          chalk.green("Global settings:"),
          JSON.stringify(globalState.data, null, 2)
        );
        const cluster = await ConnectionService.getCluster();
        console.log(
          chalk.blue(
            `Transaction signature: ${getExplorerTx(tx.data, cluster.data!)}`
          )
        );
      } catch (error) {
        console.error(chalk.red("Failed to initialize bonding curve:"), error);
      }
    });

  bondingCurveCommand
    .command("get-global-settings")
    .description("Get global settings of the bonding curve")
    .action(async () => {
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
        const globalState = await bondingCurveSerice.getGlobalSettings();
        console.log(
          chalk.green("Global settings:"),
          JSON.stringify(globalState.data, null, 2)
        );
      } catch (error) {
        console.error(chalk.red("Failed to get global settings:"), error);
      }
    });

  bondingCurveCommand
    .command("launch-token")
    .description("Create a new bonding curve")
    .option(
      "-n, --name <string>",
      "Name of the token to be created on the bonding curve"
    )
    .option(
      "-s, --symbol <string>",
      "Symbol of the token to be created on the bonding curve"
    )
    .option("-f, --file <string>", "File path to the token image")
    .option(
      "-st, --start-time <number>",
      "Start time of the token sale (timestamp in seconds)",
      (value: string) => Number(value),
      Math.floor(Math.floor(Date.now() / 1000) + 60)
    )
    .option(
      "-st, --sol-raise-target <number>",
      "SOL raise target",
      (value: string) => new BN(Number(value) * 1_000_000_000),
      new BN(100_000_000_000)
    )
    .option(
      "-d, --description <string>",
      "Description of the DAO to be created",
      (value: string) => value,
      "A DAO created from the bonding curve"
    )
    .option(
      "-x, --x-account <string>",
      "Twitter account to be used for the DAO",
      (value: string) => value
    )
    .action(async (options) => {
      // Load wallet and connection
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

      // // Create a namespace for the DAO
      // Should change this for now it is hardcoded (kinda)
      const daoNamespace = `assetCLI-${options.name}-${options.symbol}`;
      const realmCreationRes = await GovernanceService.initializeDAO(
        connection,
        keypair,
        daoNamespace,
        [keypair.publicKey],
        1
      );

      if (!realmCreationRes.success || !realmCreationRes.data) {
        console.log(chalk.red("Failed to create DAO"));
        console.log(chalk.red(realmCreationRes.error));
        return;
      }

      console.log(chalk.green("Realm DAO created successfully!"));
      console.log(
        chalk.green("Realm address:"),
        realmCreationRes.data.realmAddress.toBase58(),
        "\n",
        "Transaction signature:",
        getExplorerTx(
          realmCreationRes.data.transactionSignature,
          (await ConnectionService.getCluster()).data!
        )
      );
      const realmAddress = realmCreationRes.data.realmAddress;

      // Create the bonding curve
      const bondingCurveSerice = new BondingCurveService(
        connection,
        new Wallet(keypair),
        "confirmed",
        IDL as Idl
      );
      console.log(
        chalk.blue("Creating bonding curve..."),
        `\nName: ${options.name}\nSymbol: ${options.symbol}\nFile: ${
          options.file
        }\nStart time: ${
          options.startTime
        }\nSOL raise target: ${options.solRaiseTarget.toString()}\nDescription: ${
          options.description
        }`
      );
      const tx = await bondingCurveSerice.createBondingCurve({
        daoDescription: options.description,
        daoName: options.name,
        name: options.name,
        symbol: options.symbol,
        path: options.file,
        startTime: options.startTime,
        solRaiseTarget: options.solRaiseTarget,
        realmAddress: realmAddress,
        twitterHandle: options.xAccount,
        bullishThesis: "Bullish thesis",
      });

      if (!tx.success || !tx.data) {
        console.log(chalk.red("Failed to create bonding curve"));
        console.log(chalk.red(tx.error?.code));
        console.log(chalk.red(tx.error?.message));
        console.log(chalk.red(tx.error?.details));
        return;
      }
      console.log(chalk.green("Bonding curve created successfully!"));
      console.log(
        chalk.green("Transaction signature:"),
        getExplorerTx(tx.data.tx, (await ConnectionService.getCluster()).data!)
      );
    });

  bondingCurveCommand
    .command("swap")
    .description("Buy or sell tokens using the bonding curve")
    .option(
      "-m, --mint <string>",
      "Mint address of the token",
      (value: string) => new PublicKey(value)
    )
    .option(
      "-d, --direction <string>",
      "Direction of swap: 'buy' (SOL to token) or 'sell' (token to SOL)",
      (value: string) => {
        if (value.toLowerCase() === "buy") return "buy";
        if (value.toLowerCase() === "sell") return "sell";
        throw new Error("Direction must be either 'buy' or 'sell'");
      }
    )
    .option(
      "-a, --amount <number>",
      "Amount to swap (in SOL for buy, in tokens for sell)",
      (value: string) => new BN(Number(value) * 1_000_000_000) // Convert to lamports/raw amount
    )
    .option(
      "-min, --min-out <number>",
      "Minimum output amount (slippage protection)",
      (value: string) => new BN(Number(value) * 1_000_000_000),
      new BN(0)
    )
    .action(async (options) => {
      try {
        if (!options.mint) {
          console.log(chalk.red("Please provide a mint address"));
          return;
        }

        if (!options.direction) {
          console.log(
            chalk.red("Please provide a swap direction (buy or sell)")
          );
          return;
        }

        if (!options.amount) {
          console.log(chalk.red("Please provide an amount to swap"));
          return;
        }

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
        const bondingCurveService = new BondingCurveService(
          connection,
          new Wallet(keypair),
          "confirmed",
          IDL as Idl
        );

        // Get bonding curve data to show pricing info
        const bondingCurveData = await bondingCurveService.getBondingCurve(
          options.mint
        );
        if (!bondingCurveData.success || !bondingCurveData.data) {
          console.log(chalk.red("Failed to get bonding curve data"));
          return;
        }

        // Prepare swap parameters
        const isBaseIn = options.direction === "buy"; // true for buy (SOL in), false for sell (token in)

        console.log(chalk.blue("Executing swap..."));
        console.log(
          chalk.blue(
            `Direction: ${
              isBaseIn ? "Buy (SOL → Token)" : "Sell (Token → SOL)"
            }`
          )
        );
        console.log(
          chalk.blue(
            `Amount: ${options.amount.div(new BN(1_000_000_000)).toString()} ${
              isBaseIn ? "SOL" : "tokens"
            }`
          )
        );

        const tx = await bondingCurveService.swap(options.mint, {
          baseIn: isBaseIn,
          amount: options.amount,
          minOutAmount: options.minOut,
        });

        if (!tx.success || !tx.data) {
          console.log(chalk.red("Swap failed"));
          console.log(chalk.red(tx.error?.message));
          return;
        }

        console.log(chalk.green("Swap executed successfully!"));
        const cluster = await ConnectionService.getCluster();
        console.log(
          chalk.blue(
            `Transaction signature: ${getExplorerTx(tx.data, cluster.data!)}`
          )
        );

        // Get updated bonding curve data to show new price
        const updatedData = await bondingCurveService.getBondingCurve(
          options.mint
        );
        if (updatedData.success && updatedData.data) {
          console.log(chalk.green("Current bonding curve state:"));
          console.log(
            chalk.green("Token reserves:"),
            updatedData.data.realTokenReserves.div(new BN(1_000_000)).toString()
          );
          console.log(
            chalk.green("SOL reserves:"),
            updatedData.data.realSolReserves
              .div(new BN(1_000_000_000))
              .toString()
          );
        }
      } catch (error) {
        console.error(chalk.red("Failed to execute swap:"), error);
      }
    });
}
