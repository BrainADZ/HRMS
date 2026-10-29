export const advanceExpense = (advance) => ({
  ...advance,
  isAdvance: true,
  expense_number: 'ADV-' + String(advance.id).padStart(6, '0'),
  details: {
    category: 'Advance',
    purpose: advance.purpose,
    start_date: advance.disbursed_on || advance.created_at,
  },
});

export const expensePath = (item) =>
  item.isAdvance ? `/expenses/advances/${item.id}` : `/expenses/${item.id}`;

export const matchesExpenseStatus = (item, status) =>
  status === 'all' ||
  status === 'All' ||
  item.status === status ||
  (status === 'Pending' && item.status === 'Pending Admin');

export const expenseStatus = (item) =>
  item.status === 'Pending Admin' ? 'Pending CEO approval' : item.status;
