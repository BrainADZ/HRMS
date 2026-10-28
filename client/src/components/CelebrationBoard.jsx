import { useEffect, useState } from 'react';
import { Cake, CalendarHeart } from 'lucide-react';
import { api } from '../lib/api.js';
import { addDays, fmtDate } from '../lib/format.js';
import { useApp } from '../context.jsx';
import { Button, Modal } from './ui.jsx';

const shownThisVisit = new Set();

export default function CelebrationBoard({ publicView = false }) {
  const { user } = useApp();
  const [data, setData] = useState(null);
  const [reminderDay, setReminderDay] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get('/auth/celebrations')
        .then((result) => {
          if (alive) setData(result);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (publicView || !user || !data) return;
    const tomorrow = addDays(data.today, 1);
    if (
      !data.birthdays.some((item) => item.date === tomorrow) &&
      !data.holidays.some((item) => item.date === tomorrow)
    )
      return;
    const key = `hrms.reminders.tomorrow.${user.id}.${data.today}`;
    const show = () => {
      if (shownThisVisit.has(key) || document.querySelector('[role="dialog"]')) return;
      try {
        if (localStorage.getItem(key)) return;
      } catch {
        /* use in-memory fallback */
      }
      shownThisVisit.add(key);
      try {
        localStorage.setItem(key, 'shown');
      } catch {
        /* storage unavailable */
      }
      setReminderDay(data.today);
    };
    const timer = setInterval(show, 500);
    return () => clearInterval(timer);
  }, [data, user?.id, publicView]);
  if (!data || (!data.birthdays.length && !data.holidays.length)) return null;
  const birthdayToday = data.birthdays.filter((item) => item.date === data.today);
  const holidayToday = data.holidays.filter((item) => item.date === data.today);
  const tomorrow = addDays(data.today, 1);
  const futureBirthdays = data.birthdays.filter((item) => item.date === tomorrow);
  const futureHolidays = data.holidays.filter((item) => item.date === tomorrow);
  return (
    <>
      {(birthdayToday.length > 0 || holidayToday.length > 0) && (
        <section
          className={`celebration-board ${publicView ? 'public' : ''}`}
          aria-label="Birthdays and holidays"
        >
          {birthdayToday.length > 0 && (
            <div className="celebration-block birthday-wishes">
              <h3>
                <Cake size={19} />
                Birthday wishes
              </h3>
              <ul>
                {birthdayToday.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    Happy birthday, <strong>{item.name}</strong>! Wishing you a wonderful year
                    ahead.
                  </li>
                ))}
              </ul>
            </div>
          )}
          {holidayToday.length > 0 && (
            <div className="celebration-block holiday-wishes">
              <h3>
                <CalendarHeart size={19} />
                Holiday wishes
              </h3>
              <ul>
                {holidayToday.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <strong>{item.name}</strong> — warm wishes to everyone celebrating!
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
      {!publicView && reminderDay === data.today && (
        <Modal
          title="Upcoming birthdays & holidays"
          onClose={() => setReminderDay(null)}
          size="narrow"
          footer={
            <Button variant="primary" onClick={() => setReminderDay(null)}>
              Got it
            </Button>
          }
        >
          <p className="small muted">Tomorrow's birthdays and holidays.</p>
          <div className="celebration-reminders">
            {futureBirthdays.length > 0 && (
              <div className="celebration-block">
                <h3>
                  <Cake size={19} />
                  Birthday reminders
                </h3>
                <ul>
                  {futureBirthdays.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <strong>{item.name}</strong>
                      <span>{fmtDate(item.date, { day: 'numeric', month: 'short' })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {futureHolidays.length > 0 && (
              <div className="celebration-block">
                <h3>
                  <CalendarHeart size={19} />
                  Holiday reminders
                </h3>
                <ul>
                  {futureHolidays.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <strong>{item.name}</strong>
                      <span>
                        {fmtDate(item.date, { day: 'numeric', month: 'short' })} · {item.type}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
