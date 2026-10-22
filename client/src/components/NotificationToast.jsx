import { useEffect, useState } from 'react';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';

const DURATION = 3000;
export default function NotificationToast({ item, onClose }) {
  const [remaining, setRemaining] = useState(DURATION);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
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
  const ModuleIcon = item.module?.Icon;
  const Icon = item.kind === 'success' ? CircleCheck : item.kind === 'error' ? CircleAlert : Info;
  return (
    <div className={`toast ${item.kind}`} style={item.module ? { '--module-color': item.module.color, '--module-soft': item.module.soft, '--module-ink': item.module.ink } : undefined} role={item.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onClick={event => { if (!event.target.closest('button, a') && item.onClick) { item.onClick(); onClose(item.id); } }}>
      <div className="toast-main">
        {ModuleIcon && <span className="toast-module" title={item.module.label}><ModuleIcon size={24} /></span>}
        <Icon size={20} className="toast-icon" aria-hidden="true" />
        {item.onClick
          ? <button type="button" className="toast-message" onClick={() => { item.onClick(); onClose(item.id); }}>{item.text}</button>
          : <div className="toast-message">{item.text}</div>}
        <button type="button" className="toast-close" aria-label="Close notification" onClick={() => onClose(item.id)}><X size={17} /></button>
      </div>
      <div className="toast-timer">
        {paused ? 'Auto-close paused.' : `This message will close in ${Math.ceil(remaining / 1000)} seconds.`}
      </div>
      <div className="toast-progress" aria-hidden="true"><span style={{ width: `${remaining / DURATION * 100}%` }} /></div>
    </div>
  );
}
