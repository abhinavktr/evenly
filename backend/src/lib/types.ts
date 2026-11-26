// All money amounts are integer minor units (e.g. fils/cents) to avoid float errors.

export interface UserDoc {
  id: string; // normalised email — stable key that also lets us invite people before they sign up
  email: string;
  name: string;
  oid?: string; // Entra object id, set once the user actually signs in
  registered: boolean;
  defaultCurrency: string;
  friendIds: string[];
  invitedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupDoc {
  id: string;
  name: string;
  currency: string;
  memberIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Portion {
  userId: string;
  amount: number; // minor units
}

export type SplitType = 'equal' | 'exact' | 'percent' | 'shares';

export interface ExpenseDoc {
  id: string;
  kind: 'expense' | 'payment';
  groupId: string | null;
  description: string;
  amount: number; // minor units, > 0
  currency: string;
  date: string; // ISO date of the expense
  splitType: SplitType;
  paidBy: Portion[]; // who paid, sums to amount
  shares: Portion[]; // who owes, sums to amount
  participantIds: string[];
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  deletedBy?: string;
}

/** A directed debt: `from` owes `to` `amount` minor units in `currency`. */
export interface Debt {
  from: string;
  to: string;
  amount: number;
  currency: string;
}
