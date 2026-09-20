export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: Date;
  source: 'text' | 'audio' | 'image';
}

export interface Bill {
  id: string;
  amount: number;
  description: string;
  dueDate: Date;
  paid: boolean;
  paidDate?: Date;
}

export interface ShoppingItem {
  id: string;
  item: string;
  quantity: number;
  purchased: boolean;
  purchasedDate?: Date;
  addedDate: Date;
}

export interface UsageRecord {
  service: 'speech' | 'vision';
  month: string;
  used: number;
  limit: number;
}

export interface MonthlySummary {
  month: string;
  totalExpenses: number;
  categories: CategorySummary[];
  pendingBills: Bill[];
  recentExpenses: Expense[];
}

export interface CategorySummary {
  category: string;
  total: number;
  count: number;
}

export interface AlertInfo {
  service: 'speech' | 'vision';
  used: number;
  limit: number;
  percentage: number;
  level: 'ok' | 'attention' | 'warning' | 'critical' | 'exceeded';
}

export interface ParsedExpense {
  amount: number;
  description: string;
  category?: string;
  date?: Date;
}

export interface ParsedBill {
  amount: number;
  description: string;
  dueDate: Date;
}

export interface ReceiptData {
  store: string;
  total: number;
  date: Date;
  items: ReceiptItem[];
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
}
