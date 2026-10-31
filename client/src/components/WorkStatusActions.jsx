import { withAbsenceReasons } from '../lib/missing-attendance.js';
import { useState } from 'react';
import { Plane, MapPin, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context.jsx';
import { api } from '../lib/api.js';
import { useAction } from '../lib/hooks.js';
import { refreshWorkday, useWorkday } from '../lib/workday.js';
import { Button, Modal, Field, Input, Textarea, Badge } from './ui.jsx';

export default function WorkStatusActions({ onDone, activeOnly = false, legacyTrip }) {
  const { user, meta, toast } = useApp();
  const workday = useWorkday();
  const [kind, setKind] = useState(null);
  const [date, setDate] = useState(meta.today);
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [run, busy] = useAction(toast);
  if (!user.employeeId || user.isOwner) return null;
  const current = workday?.currentWorkStatus;
  const travelling = current
    ? current.kind === 'travel'
    : ['Travelling', 'Travel started'].includes(legacyTrip?.current_status);
  const finish = async () => {
    const result = await run(
      async () => {
        if (current) return api.post('/work-status/' + current.id + '/end');
        if (travelling)
          return api.post('/travel/' + legacyTrip.id + '/journey', { action: 'reached' });
        const form = new FormData();
        form.append('status', 'Work completed');
        return api.upload('/travel/' + legacyTrip.id + '/updates', form);
      },
      travelling ? 'Destination reached' : 'Duty completed',
    );
    if (result) {
      await refreshWorkday();
      onDone?.();
    }
  };
  if (current || legacyTrip)
    return (
      <div className="row wrap gap-8">
        <Badge tone="blue">{travelling ? 'Travelling' : 'On-site duty'}</Badge>
        <Button icon={CheckCircle2} loading={busy} onClick={finish}>
          {travelling ? 'Reached' : 'Finish duty'}
        </Button>
      </div>
    );
  if (activeOnly) return null;
  const choose = (next) => {
    setDate(meta.today);
    setTime(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: meta.settings?.timezone || meta.timezone || 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    );
    setReason('');
    setKind(next);
  };
  const save = async () => {
    if (
      await run(
        async () =>
          api.post('/work-status', await withAbsenceReasons({ kind, date, time, reason })),
        'Work status saved',
      )
    ) {
      setKind(null);
      await refreshWorkday();
      onDone?.();
    }
  };
  return (
    <>
      <Button icon={Plane} onClick={() => choose('travel')}>
        Travelling
      </Button>
      <Button icon={MapPin} onClick={() => choose('on_site')}>
        On-site duty
      </Button>
      {kind && (
        <Modal
          title={kind === 'travel' ? 'Travelling' : 'On-site duty'}
          size="narrow"
          onClose={busy ? undefined : () => setKind(null)}
          footer={
            <>
              <Button disabled={busy} onClick={() => setKind(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={!date || !time || !reason.trim()}
                onClick={save}
              >
                Save status
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Date">
              <Input
                aria-label="Status date"
                type="date"
                value={date}
                max={meta.today}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Time">
              <Input
                aria-label="Status time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Reason">
            <Textarea
              aria-label="Status reason"
              value={reason}
              maxLength={2000}
              placeholder="Where are you going or what are you working on?"
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </Modal>
      )}
    </>
  );
}
