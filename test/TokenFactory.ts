import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { ConfidentialToken, TokenFactory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("TokenFactory and ConfidentialToken", function () {
  let deployer: HardhatEthersSigner;
  let buyer: HardhatEthersSigner;
  let factory: TokenFactory;

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This test suite is intended for the local FHEVM mock network");
      this.skip();
    }

    [deployer, buyer] = await ethers.getSigners();
    const factoryFactory = await ethers.getContractFactory("TokenFactory");
    factory = (await factoryFactory.deploy()) as TokenFactory;
    await factory.waitForDeployment();
  });

  it("creates tokens with default supply when none is provided", async function () {
    const pricePerToken = 1_000_000_000_000_000n; // 0.001 ETH
    const tx = await factory.createToken("Launch Token", "LCH", 0, pricePerToken);
    await tx.wait();

    const [tokens, saleSupply] = await factory.getCatalog();
    expect(tokens.length).to.eq(1);
    expect(tokens[0].maxSupply).to.eq(1_000_000_000n);
    expect(saleSupply[0]).to.eq(1_000_000_000n);

    const token = (await ethers.getContractAt("ConfidentialToken", tokens[0].token)) as ConfidentialToken;
    const priceFromContract = await token.pricePerToken();
    expect(priceFromContract).to.eq(pricePerToken);
  });

  it("lets a buyer purchase tokens and decrypt their confidential balance", async function () {
    const customSupply = 100_000n;
    const pricePerToken = 500_000_000_000n; // 0.0005 ETH

    const tx = await factory.createToken("Balance Token", "BLN", Number(customSupply), pricePerToken);
    await tx.wait();

    const [tokens] = await factory.getCatalog();
    const token = (await ethers.getContractAt("ConfidentialToken", tokens[0].token)) as ConfidentialToken;
    const tokenAddress = await token.getAddress();

    const buyAmount = 25n;
    const purchaseTx = await token.connect(buyer).buy(buyAmount, { value: pricePerToken * buyAmount });
    await purchaseTx.wait();

    const saleRemaining = await token.saleSupply();
    expect(saleRemaining).to.eq(customSupply - buyAmount);

    const encryptedBalance = await token.confidentialBalanceOf(buyer.address);
    const clearBalance = await fhevm.userDecryptEuint(FhevmType.euint64, encryptedBalance, tokenAddress, buyer);
    expect(clearBalance).to.eq(buyAmount);
  });
});
