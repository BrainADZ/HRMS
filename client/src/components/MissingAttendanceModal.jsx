import { useState, useSyncExternalStore } from 'react';
import { missingAttendanceStore, finishMissingAttendance } from '../lib/missing-attendance.js';
import { fmtDay } from '../lib/format.js';
import { Modal, Button, Field, Textarea } from './ui.jsx';

export default function MissingAttendanceModal() {
  const prompt = useSyncExternalStore(
    missingAttendanceStore.subscribe,
    missingAttendanceStore.snapshot,
  );
  return prompt ? (
    <Reasons key={prompt.items.map((item) => item.id).join(',')} items={prompt.items} />
  ) : null;
}
function Reasons({ items }) {
  const [reasons, setReasons] = useState({});
  const cancel = () => finishMissingAttendance(null);
  return (
    <Modal
      title="Explain missing attendance"
      size="narrow"
      onClose={cancel}
      footer={
        <>
          <Button onClick={cancel}>Cancel check-in</Button>
          <Button
            variant="primary"
            disabled={items.some((item) => !reasons[item.id]?.trim())}
            onClick={() =>
              finishMissingAttendance(
                items.map((item) => ({ id: item.id, reason: reasons[item.id].trim() })),
              )
            }
          >
            Continue check-in
          </Button>
        </>
      }
    >
      <p className="small muted mb-16">
        No attendance was recorded on these working days, so they are marked Absent. Add a reason
        for your manager before continuing.
      </p>
      {items.map((item) => (
        <Field key={item.id} label={fmtDay(item.date)}>
          <Textarea
            aria-label={'Reason for ' + item.date}
            maxLength={1000}
            placeholder="Why was no attendance recorded?"
            value={reasons[item.id] || ''}
            onChange={(event) => setReasons((old) => ({ ...old, [item.id]: event.target.value }))}
          />
        </Field>
      ))}
    </Modal>
  );
}
