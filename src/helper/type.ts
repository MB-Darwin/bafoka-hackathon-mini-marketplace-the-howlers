export enum TransactionStatus {
  Pending = 0,
  Completed = 1,
  Cancelled = 2,
}

export interface Transaction {
  id: string; // bigint as string for JSON
  txKey: string;
  buyer: string;
  seller: string;
  amount: string; // bigint as string for JSON
  status: TransactionStatus;
  createdAt: string; // bigint as string for JSON
  completedAt: string; // bigint as string for JSON
  productId: string;
  orderId: string;
}

export interface CreateTransactionRequest {
  seller: string;
  productId: string;
  orderId: string;
}

export interface TxKeyRequest {
  txKey: string;
}