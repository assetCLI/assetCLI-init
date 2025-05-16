#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
// import { registerWalletCommands } from "./commands/wallet";
// import { registerConfigCommands } from "./commands/config";
// import { registerDaoCommands } from "./commands/dao";
// import { registerProposalCommands } from "./commands/proposal";
import { sendFirstUseGATelemetry } from "./utils/googleAnalytics";
import { registerBondingCurveCommands } from "./commands/bonding-curve";

async function main() {
  const program = new Command();

  program
    .name("assetCLI")
    .description("Multisig DAO CLI Management Tool")
    .version("1.0.0")
    .option("--noga", "Disable Google Analytics telemetry");

  // Register commands
  // registerWalletCommands(program);
  // registerConfigCommands(program);
  // registerDaoCommands(program);
  // registerProposalCommands(program);
  registerBondingCurveCommands(program);
  // Add a default help command
  program
    .command("help")
    .description("Display help information")
    .action(() => {
      program.help();
    });

  // Get options without executing commands
  program.parseOptions(process.argv);
  const options = program.opts();
  await sendFirstUseGATelemetry(options.noga);

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(chalk.red("Error executing command:"), error);
    process.exit(1);
  }
}

main();
