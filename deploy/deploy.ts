import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFactory = await deploy("TokenFactory", {
    from: deployer,
    log: true,
  });

  console.log(`TokenFactory contract: `, deployedFactory.address);
};
export default func;
func.id = "deploy_tokenFactory"; // id required to prevent reexecution
func.tags = ["TokenFactory"];
