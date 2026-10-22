import { useEffect, useState } from 'react';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';

const DURATION = 12000;
export default function NotificationToast({ item, onClose }) {
  const [remaining, setRemaining] = useState(DURATION);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    let previous = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      setRemaining((value) => Math.max(0, value - (now - previous)));
      previous = now;
    }, 100);
    return () => clearInterval(timer);
  }, [paused]);
  useEffect(() => { if (remaining === 0) onClose(item.id); }, [remaining, item.id, onClose]);
  const Icon = item.kind === 'success' ? CircleCheck : item.kind === 'error' ? CircleAlert : Info;
  return (
    <div className={`toast ${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'}>
      <div className="toast-main">
        <Icon size={20} className="toast-icon" aria-hidden="true" />
        {item.onClick
          ? <button type="button" className="toast-message" onClick={() => { item.onClick(); onClose(item.id); }}>{item.text}</button>
          : <div className="toast-message">{item.text}</div>}
        <button type="button" className="toast-close" aria-label="Close notification" onClick={() => onClose(item.id)}><X size={17} /></button>
      </div>
      <button type="button" className="toast-timer" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
        {paused ? 'Auto-close paused.' : `This message will close in ${Math.ceil(remaining / 1000)} seconds.`}
        {' '}<strong>{paused ? 'Click to resume.' : 'Click to stop.'}</strong>
      </button>
      <div className="toast-progress" aria-hidden="true"><span style={{ width: `${remaining / DURATION * 100}%` }} /></div>
    </div>
  );
}
