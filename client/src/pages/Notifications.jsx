import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react';
import { useApp } from '../context.jsx';
import { useApi } from '../lib/hooks.js';
import { api } from '../lib/api.js';
import { fmtDate, fmtTime } from '../lib/format.js';
import { Empty, ErrorBox, Loading } from '../components/ui.jsx';
import './Notifications.css';

export default function NotificationsPage() {
  const { user, toast } = useApp();
  const { data, error, reload } = useApi('/notifications?all=1');
  const navigate = useNavigate();

  const openNotification = async (item) => {
    if (!item.read) {
      try {
        await api.post(`/notifications/${item.id}/read`);
        reload();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
    if (item.link) navigate(item.link);
  };

  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="notifications-page">
      <div className="page-head">
        <div>
          <Link className="link" to={user.role === 'employee' ? '/my' : '/'}>
            <ArrowLeft size={16} /> Back to dashboard
          </Link>
          <h1>Notifications</h1>
          <div className="sub">All your notifications, newest first</div>
        </div>
        {data?.unread > 0 && (
          <button
            type="button"
            className="link"
            onClick={async () => {
              try {
                await api.post('/notifications/read-all');
                reload();
              } catch (err) {
                toast(err.message, 'error');
              }
            }}
          >
            <CheckCheck size={16} /> Mark all read
          </button>
        )}
      </div>
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <div className="card">
          <Empty icon={Bell} text="No notifications yet." />
        </div>
      ) : (
        <div className="notifications-list">
          {data.items.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`card notification-entry ${item.read ? '' : 'unread'}`}
              onClick={() => openNotification(item)}
            >
              <span className="notification-entry-icon">
                <Bell size={20} />
              </span>
              <span className="notification-entry-content">
                <span className="notification-entry-text">{item.text}</span>
                <span className="small muted">
                  {fmtDate(item.created_at)} at {fmtTime(item.created_at)}
                </span>
              </span>
              {!item.read && <span className="notification-entry-dot" aria-label="Unread" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
