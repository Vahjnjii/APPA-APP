import { Timestamp } from 'firebase/firestore';

export type JobCategory = 'job' | 'program' | 'reminder';
export type JobPriority = 'important' | 'less-important';
export type TransactionType = 'income' | 'expense';

export interface Job {
  id: string;
  userId: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm (24h format internally)
  category: JobCategory;
  priority: JobPriority;
  hasEarning: boolean;
  earningAmount: number;
  isCompleted: boolean;
  location?: string;
  createdAt: Timestamp;
}

export interface Transaction {
  id: string;
  userId: string;
  title: string; // Reason
  amount: number;
  type: TransactionType;
  date: string; // YYYY-MM-DD
  description?: string;
  createdAt: Timestamp;
}

export type NewJob = Omit<Job, 'id' | 'createdAt'>;
export type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>;

export interface UserConfig {
  googleSheetsConfig?: {
    spreadsheetId: string;
    spreadsheetUrl: string;
  };
}
