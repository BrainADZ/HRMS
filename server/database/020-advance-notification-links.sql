UPDATE notifications SET link = '/expenses/approvals'
WHERE text LIKE '%submitted final expenses for advance #%';

UPDATE notifications SET link = '/expenses/approvals'
WHERE text LIKE 'Advance request:%'
   OR text LIKE '%accepted expense advance #%'
   OR text LIKE 'Expense advance request #% was rejected';

UPDATE notifications SET link = '/expenses'
WHERE text LIKE 'You have been given an expense advance of %'
   OR text LIKE 'Advance #% settled by Accounts';
