import { useEffect, useState } from 'react';
import { Cake, CalendarHeart, Megaphone } from 'lucide-react';
import { api } from '../lib/api.js';
import { addDays, fmtDate } from '../lib/format.js';
import { useApp } from '../context.jsx';
import { Button, Modal } from './ui.jsx';

export default function CelebrationBoard({ publicView = false }) {
  const { user } = useApp();
  const [data, setData] = useState(null);
  const [newAnnouncement, setNewAnnouncement] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([
        api.get('/auth/celebrations'),
        !publicView && user ? api.get('/notices') : Promise.resolve({ items: [] }),
      ])
        .then(([result, notices]) => {
          if (alive) setData({ ...result, announcements: notices.items || [] });
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [publicView, user?.id]);
  useEffect(() => {
    if (publicView || !user || !data) return;
    const latest = data.announcements?.[0];
    if (!latest) return;
    const key = `hrms.lastAnnouncement.${user.id}`;
    const seen = localStorage.getItem(key);
    if (seen === null) {
      localStorage.setItem(key, String(latest.id));
      return;
    }
    if (Number(latest.id) > Number(seen) && new Date(latest.created_at) <= new Date()) {
      localStorage.setItem(key, String(latest.id));
      setNewAnnouncement(latest);
    }
  }, [data, user?.id, publicView]);
  if (!data) return null;
  const tomorrow = addDays(data.today, 1);
  const futureBirthdays = data.birthdays.filter(
    (item) => item.date >= data.today && item.date <= tomorrow,
  );
  const futureHolidays = data.holidays.filter(
    (item) => item.date >= data.today && item.date <= tomorrow,
  );
  return (
    <>
      {publicView && (
        <section
          className={`celebration-board ${publicView ? 'public' : ''}`}
          aria-label="Birthdays and holidays"
        >
          {!futureBirthdays.length && !futureHolidays.length && (
            <div className="celebration-block">
              <h3>
                <CalendarHeart size={19} /> Birthdays & holidays
              </h3>
              <p className="small muted">
                No birthdays or holidays today or tomorrow. Company announcements are available
                after sign-in.
              </p>
            </div>
          )}
          {futureBirthdays.length > 0 && (
            <div className="celebration-block birthday-wishes">
              <h3>
                <Cake size={19} />
                Birthdays & wishes
              </h3>
              <ul>
                {futureBirthdays.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <strong>{item.name}</strong> ·{' '}
                    {item.date === data.today
                      ? 'Happy birthday today! Wishing you a wonderful year ahead.'
                      : 'Birthday tomorrow!'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {futureHolidays.length > 0 && (
            <div className="celebration-block holiday-wishes">
              <h3>
                <CalendarHeart size={19} />
                Holiday wishes
              </h3>
              <ul>
                {futureHolidays.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <strong>{item.name}</strong> · {item.date === data.today ? 'Today' : 'Tomorrow'}{' '}
                    — warm wishes to everyone celebrating!
                    {item.type === 'Restricted'
                      ? ' Optional / restricted holiday.'
                      : ' Enjoy the holiday.'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {!publicView && newAnnouncement && (
        <Modal
          title="New announcement"
          onClose={() => setNewAnnouncement(null)}
          size="narrow"
          footer={
            <Button variant="primary" onClick={() => setNewAnnouncement(null)}>
              Got it
            </Button>
          }
        >
          <div className="celebration-reminders">
            {newAnnouncement && (
              <div className="celebration-block" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <h3>
                  <Megaphone size={19} /> Announcements
                </h3>
                {[newAnnouncement].map((item) => (
                  <div
                    key={item.id}
                    style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}
                  >
                    <strong>{item.title}</strong>
                    {item.body && (
                      <p
                        className="small muted"
                        style={{ marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                      >
                        {item.body}
                      </p>
                    )}
                    <span className="small muted">{fmtDate(item.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
