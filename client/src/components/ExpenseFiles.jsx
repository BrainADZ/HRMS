import './ExpenseFiles.css';
import { File, FileText, FileSpreadsheet, Image } from 'lucide-react';

export const expenseNumber = (e) => e.expense_number || 'EXP-' + String(e.id).padStart(6, '0');
export const expenseMoney = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
export const expenseFiles = (e) => [
  ...(e.details?.attachments || []).map((f, i) => ({ ...f, index: String(i) })),
  ...(e.proof_file ? [{ name: e.proof_name || e.proof_file, index: 'legacy' }] : []),
];
export function ExpenseFileIcon({ name = '', large = false }) {
  const ext = name.split('.').pop().toLowerCase();
  const type =
    ext === 'pdf'
      ? 'pdf'
      : ['doc', 'docx'].includes(ext)
        ? 'doc'
        : ['xls', 'xlsx', 'csv'].includes(ext)
          ? 'xls'
          : ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
            ? 'image'
            : 'file';
  const Icon =
    type === 'xls' ? FileSpreadsheet : type === 'image' ? Image : type === 'file' ? File : FileText;
  const label = { pdf: 'PDF', doc: 'DOC', xls: 'XLS', image: 'IMG', file: 'FILE' }[type];
  return (
    <span
      className={'expense-format-icon ' + type + (large ? ' large' : '')}
      title={name ? label + ' document' : 'No receipt attached'}
    >
      <Icon size={large ? 30 : 22} />
      <span>{label}</span>
    </span>
  );
}
