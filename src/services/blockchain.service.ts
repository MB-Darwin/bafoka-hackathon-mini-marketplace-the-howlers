import { ethers } from "ethers";
import dotenv from "dotenv";
import abi from "./MarketplaceNoFee.json"; // ABI from Hardhat artifacts

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const contractAddress = process.env.CONTRACT_ADDRESS!;
const contract = new ethers.Contract(contractAddress, abi.abi, wallet);

export { provider, wallet, contract };
