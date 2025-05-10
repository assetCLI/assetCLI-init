// import { Command } from "commander";
// import chalk from "chalk";
// import { WalletService } from "../services/wallet-service";
// import { ConnectionService } from "../services/connection-service";
// import { ConfigService } from "../services/config-service";

// export function registerWalletCommands(program: Command): void {
//   const walletCommand = program
//     .command("wallet")
//     .description("Wallet management commands");

//   walletCommand
//     .command("create")
//     .description("Create a new wallet")
//     .action(async () => {
//       try {
//         const walletResponse = await WalletService.createWallet();

//         if (!walletResponse.success || !walletResponse.data) {
//           console.error(
//             chalk.red("Failed to create wallet:"),
//             walletResponse.error?.message || "Unknown error"
//           );
//           return;
//         }

//         console.log(chalk.green("✓ Wallet created successfully!"));
//         console.log(chalk.yellow("Public Key:"), walletResponse.data.pubkey);
//         console.log(
//           chalk.yellow(
//             "⚠️  WARNING: Keep your secret key safe. Anyone with access to it can control your funds."
//           )
//         );
//       } catch (error) {
//         console.error(chalk.red("Failed to create wallet:"), error);
//       }
//     });

//   walletCommand
//     .command("import")
//     .description("Import an existing wallet")
//     .argument(
//       "<secretKey>",
//       "Secret key as an array, base58 string, or path to keypair file"
//     )
//     .action(async (secretKey) => {
//       try {
//         const walletResponse = await WalletService.importWallet(secretKey);

//         if (!walletResponse.success || !walletResponse.data) {
//           console.error(
//             chalk.red("Failed to import wallet:"),
//             walletResponse.error?.message || "Unknown error"
//           );
//           return;
//         }

//         console.log(chalk.green("✓ Wallet imported successfully!"));
//         console.log(chalk.yellow("Public Key:"), walletResponse.data.pubkey);
//       } catch (error) {
//         console.error(chalk.red("Failed to import wallet:"), error);
//       }
//     });

//   walletCommand
//     .command("show")
//     .description("Display current wallet information")
//     .action(async () => {
//       try {
//         const walletResponse = await WalletService.loadWallet();

//         if (!walletResponse.success || !walletResponse.data) {
//           console.log(
//             chalk.yellow(
//               'No wallet configured. Use "dao wallet create" to create one.'
//             )
//           );
//           return;
//         }

//         const configResponse = await ConfigService.getConfig();
//         const connectionResponse = await ConnectionService.getConnection();

//         if (!connectionResponse.success || !connectionResponse.data) {
//           console.error(
//             chalk.red("Failed to establish connection:"),
//             connectionResponse.error?.message || "Unknown error"
//           );
//           return;
//         }

//         console.log(chalk.blue("Wallet Information:"));
//         console.log(chalk.yellow("Public Key:"), walletResponse.data.pubkey);

//         try {
//           const connection = connectionResponse.data;
//           const balanceResponse = await WalletService.getBalance(
//             connection,
//             walletResponse.data.pubkey
//           );

//           if (balanceResponse.success && balanceResponse.data !== undefined) {
//             console.log(
//               chalk.yellow("Balance:"),
//               `${balanceResponse.data} SOL`
//             );

//             if (configResponse.success && configResponse.data?.dao?.cluster) {
//               console.log(
//                 chalk.yellow("Network:"),
//                 configResponse.data.dao.cluster
//               );
//             } else {
//               console.log(chalk.yellow("Network:"), "Not set");
//             }
//           } else {
//             console.log(
//               chalk.red("Could not fetch balance:"),
//               balanceResponse.error?.message || "Unknown error"
//             );
//           }
//         } catch (error) {
//           console.log(chalk.red("Could not fetch balance:"), error);
//         }
//       } catch (error) {
//         console.error(chalk.red("Failed to load wallet:"), error);
//       }
//     });
// }
