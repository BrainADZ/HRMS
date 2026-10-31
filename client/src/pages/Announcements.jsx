import { Link } from 'react-router-dom';
import { ArrowLeft, Megaphone, Trash2 } from 'lucide-react';
import { useApp } from '../context.jsx';
import { useApi, useAction } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate, fmtTime } from '../lib/format.js';
import { Empty, ErrorBox, Loading, useConfirm } from '../components/ui.jsx';
import '../components/Announcements.css';

export default function Announcements() {
  const { user, isHR, toast } = useApp();
  const { data, error, reload } = useApi('/notices');
  const [run] = useAction(toast);
  const [confirm, confirmEl] = useConfirm();
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="announcements-page">
      <div className="page-head">
        <div>
          <Link className="link" to={user.role === 'employee' ? '/my' : '/'}>
            <ArrowLeft size={16} /> Back to dashboard
          </Link>
          <h1>Announcements</h1>
          <div className="sub">All company updates, newest first</div>
        </div>
      </div>
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty icon={Megaphone} text="No announcements yet." />
      ) : (
        <div className="announcements-list">
          {data.items.map((notice) => (
            <article className="card announcement-full-item" key={notice.id}>
              <div className="announcement-full-main">
                <span className="announcement-item-icon">
                  <Megaphone size={20} />
                </span>
                <div className="grow">
                  <h2>{notice.title}</h2>
                  <div className="small muted">
                    Posted by {notice.posted_by} · {fmtDate(notice.created_at)} at{' '}
                    {fmtTime(notice.created_at)}
                  </div>
                  {notice.body && <p>{notice.body}</p>}
                </div>
              </div>
              {(isHR || notice.created_by === user.id) && (
                <button
                  className="icon-btn"
                  type="button"
                  aria-label={`Delete ${notice.title}`}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: 'Delete notice?',
                        text: notice.title,
                        danger: true,
                        confirmLabel: 'Delete',
                      })
                    ) {
                      if (await run(() => api.del(`/notices/${notice.id}`), 'Notice deleted'))
                        reload();
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {confirmEl}
    </div>
  );
}
