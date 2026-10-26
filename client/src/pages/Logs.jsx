import { useState } from 'react';
import { useApi } from '../lib/hooks.js';
import { fmtDateTime } from '../lib/format.js';
import { Card, Empty, ErrorBox, Input, Loading } from '../components/ui.jsx';

export default function Logs() {
  const { data, error, reload } = useApi('/audit');
  const [search, setSearch] = useState('');
  const rows = (data?.items || []).filter((item) =>
    `${item.email || ''} ${item.action} ${item.entity || ''} ${item.entity_id || ''}`
      .toLowerCase().includes(search.toLowerCase()),
  );
  return <div>
    <div className="page-head"><div><h1>Logs</h1><div className="sub">Recent admin and employee actions</div></div></div>
    <Card title="Activity log" action={<Input aria-label="Search logs" placeholder="Search user or action" value={search} onChange={(event) => setSearch(event.target.value)} />}>
      {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Loading /> : rows.length ? <div className="table-wrap"><table className="table"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td>{fmtDateTime(item.created_at)}</td><td>{item.email || 'System'}</td><td>{item.action}</td><td>{item.entity ? `${item.entity} #${item.entity_id ?? ''}` : '—'}</td></tr>)}</tbody></table></div> : <Empty text="No matching logs" />}
    </Card>
  </div>;
}
