import { ethers } from "ethers";
import dotenv from "dotenv";
import { Transaction } from "./types";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL!);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const marketplaceABI = [
  "function createTransactionETH(address seller, uint256 amount, string calldata productId, string calldata orderId) external payable returns (bytes32)",
  "function completeTransaction(bytes32 txKey) external",
  "function cancelTransaction(bytes32 txKey) external",
  "function setDispute(bytes32 txKey, bool disputed) external",
  "function getTransaction(bytes32 txKey) external view returns (tuple(uint256 id, bytes32 txKey, address buyer, address seller, uint256 amount, uint8 status, uint256 createdAt, uint256 completedAt, string productId, string orderId))",
  "function getBuyerTransactions(address buyer) external view returns (bytes32[])",
  "function getSellerTransactions(address seller) external view returns (bytes32[])",
  "event TransactionCreated(bytes32 indexed txKey, uint256 indexed id, address indexed buyer, address seller, uint256 amount, string productId, string orderId)",
  "event TransactionCompleted(bytes32 indexed txKey, uint256 indexed id, address indexed seller, uint256 amount)",
  "event TransactionCancelled(bytes32 indexed txKey, uint256 indexed id, address indexed buyer, uint256 amount)",
  "event TransactionDisputed(bytes32 indexed txKey, uint256 indexed id, bool disputed)"
];

export const marketplaceContract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS!,
  marketplaceABI,
  wallet
);

export const getTransaction = async (txKey: string): Promise<Transaction> => {
  const txn = await marketplaceContract.getTransaction(txKey);
  return {
    id: txn.id,
    txKey: txn.txKey,
    buyer: txn.buyer,
    seller: txn.seller,
    amount: txn.amount,
    status: txn.status,
    createdAt: txn.createdAt,
    completedAt: txn.completedAt,
    productId: txn.productId,
    orderId: txn.orderId,
  };
};

export const createTransactionETH = async (
  seller: string,
  amount: string,
  productId: string,
  orderId: string
): Promise<string> => {
  const tx = await marketplaceContract.createTransactionETH(
    seller,
    ethers.parseEther(amount),
    productId,
    orderId,
    { value: ethers.parseEther(amount) }
  );
  await tx.wait();
  return tx.hash;
};

export const completeTransaction = async (txKey: string): Promise<string> => {
  const tx = await marketplaceContract.completeTransaction(txKey);
  await tx.wait();
  return tx.hash;
};

export const cancelTransaction = async (txKey: string): Promise<string> => {
  const tx = await marketplaceContract.cancelTransaction(txKey);
  await tx.wait();
  return tx.hash;
};

export const setDispute = async (txKey: string, disputed: boolean): Promise<string> => {
  const tx = await marketplaceContract.setDispute(txKey, disputed);
  await tx.wait();
  return tx.hash;
};

export const getBuyerTransactions = async (buyer: string): Promise<string[]> => {
  return await marketplaceContract.getBuyerTransactions(buyer);
};

export const getSellerTransactions = async (seller: string): Promise<string[]> => {
  return await marketplaceContract.getSellerTransactions(seller);
};