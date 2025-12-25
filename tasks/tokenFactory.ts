import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:create-token", "Create a new ERC7984 token through the factory")
  .addParam("name", "Token name")
  .addParam("symbol", "Token symbol")
  .addOptionalParam("supply", "Total supply (uint64). Defaults to 1_000_000_000 when omitted", undefined, undefined, true)
  .addParam("price", "Price per token in wei")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const factoryDeployment = await deployments.get("TokenFactory");
    const factory = await ethers.getContractAt("TokenFactory", factoryDeployment.address);

    const supply = taskArguments.supply ? BigInt(taskArguments.supply) : BigInt(0);
    const price = BigInt(taskArguments.price);

    const tx = await factory.createToken(taskArguments.name, taskArguments.symbol, supply, price);
    console.log(`Submitting token creation tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Token creation confirmed in block ${receipt?.blockNumber}`);

    const total = await factory.tokenCount();
    const lastIndex = total - 1n;
    const created = await factory.getToken(lastIndex);
    console.log(`New token deployed at ${created.token} with price ${created.pricePerToken} wei`);
  });

task("task:catalog", "List all tokens created through the factory").setAction(async function (_taskArguments, hre) {
  const { ethers, deployments } = hre;

  const factoryDeployment = await deployments.get("TokenFactory");
  const factory = await ethers.getContractAt("TokenFactory", factoryDeployment.address);

  const [tokens, saleSupply] = await factory.getCatalog();
  if (tokens.length === 0) {
    console.log("No tokens created yet");
    return;
  }

  tokens.forEach((token, idx) => {
    console.log(
      `#${idx} ${token.name} (${token.symbol}) @ ${token.token} price=${token.pricePerToken} wei ` +
        `maxSupply=${token.maxSupply} remaining=${saleSupply[idx]} creator=${token.creator}`,
    );
  });
});

task("task:buy-token", "Buy a token with ETH")
  .addParam("token", "Token address")
  .addParam("amount", "Amount to buy (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers } = hre;
    const amount = BigInt(taskArguments.amount);

    const token = await ethers.getContractAt("ConfidentialToken", taskArguments.token);
    const price = await token.pricePerToken();
    const requiredValue = price * amount;

    const tx = await token.buy(amount, { value: requiredValue });
    console.log(`Buying ${amount} tokens for ${requiredValue} wei. tx=${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Purchase confirmed in block ${receipt?.blockNumber}`);
  });
