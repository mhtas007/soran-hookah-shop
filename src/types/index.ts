export type Role = 'Admin' | 'Manager' | 'Cashier';

export interface User {
  id: string;
  name: string;
  email?: string;
  role: Role;
  permissions?: string[];
  /** Secure session token (set after the SQL security upgrade is installed) */
  sessionToken?: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt?: string;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  costPrice: number;
  sellingPrice: number;
  category: string;
  stockLevel: number;
  minStockAlert: number;
  section: string;
  company?: string;
  bulkCost: number;
  bulkPrice: number;
  halfBulkCost?: number;
  halfBulkPrice?: number;
  bulkSize: number;
  bulkBarcode?: string;
  currency: string;
  costCurrency?: string;
  expiryDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 'Cash' | 'FIB' | 'Debt';
export type SellUnit = 'Piece' | 'HalfTaka' | 'Taka';

export interface CartItem extends Product {
  quantity: number;
  isGift?: boolean;
  sellUnit?: SellUnit;
}

export interface Sale {
  id: string;
  cashierId: string;
  items: {
    productId: string;
    name: string;
    quantity: number;
    price: number; // selling price at time of sale
    cost: number;  // cost price at time of sale
  }[];
  totalAmount: number;
  totalProfit: number;
  paymentMethod: PaymentMethod;
  paymentAmount: number; // How much paid upfront
  discount: number; // Discount amount applied
  debtCustomerId?: string; // If Debt payment
  debtCustomer?: { name: string }; // For reports
  createdAt: string;
  status: 'Completed' | 'Returned' | 'Void';
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  totalPurchases: number;
  totalPaid: number;
  remainingDebt: number;
  createdAt: string;
}

export interface DebtPayment {
  id: string;
  customerId: string;
  amount: number;
  date: string;
  notes: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  totalPurchases: number;
  totalPaid: number;
  remainingDebt: number;
  createdAt: string;
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  date: string;
  notes: string;
  createdAt: string;
}

export interface Settings {
  shopName: string;
  phone: string;
  address: string;
  receiptFooter: string;
  receiptHeader?: string;
  logoUrl?: string;
  usdRate: number;
  telegramBotToken?: string;
  telegramChatId?: string;
  autoBackupTime?: string;
  autoLogoutTime?: number;
  imgbbApiKey?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  metadata?: any;
  createdAt: string;
}

export interface MixRecipe {
  id: string;
  name: string;
  outputProductId: string;
  expectedYield: number;
  createdAt: string;
  ingredients?: MixRecipeIngredient[];
}

export interface MixRecipeIngredient {
  id: string;
  recipeId: string;
  productId: string;
  quantity: number;
  unit: string;
  product?: Product;
}

export interface MixBatch {
  id: string;
  recipeId?: string;
  outputProductId?: string;
  yieldGrams: number;
  costAmount: number;
  createdAt: string;
  recipe?: MixRecipe;
  outputProduct?: Product;
  ingredients?: MixBatchIngredient[];
}

export interface MixBatchIngredient {
  id: string;
  batchId: string;
  productId: string;
  quantity: number;
  unit: string;
  costAmount: number;
  product?: Product;
}
