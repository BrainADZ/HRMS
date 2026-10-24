import { useEffect, useState } from 'react';
import { useApp } from '../context.jsx';
import { api } from '../lib/api.js';
import { useAction } from '../lib/hooks.js';
import { Avatar, Button, Modal } from './ui.jsx';

export default function ProfilePhoto({ onClose }) {
  const { user, toast, refreshPhotos } = useApp();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [run, busy] = useAction(toast);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const choose = (event) => {
    const selected = event.target.files[0];
    setError('');
    if (!selected) return;
    if (
      !/\.(png|jpe?g|webp)$/i.test(selected.name) ||
      selected.size > 3 * 1024 * 1024 ||
      !selected.size
    ) {
      setFile(null);
      setError('Choose a JPG, PNG or WebP image, up to 3 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
  };
  const save = async () => {
    if (!file) return;
    const form = new FormData();
    form.append('photo', file);
    if (await run(() => api.upload('/profile/photo', form), 'Profile photo updated')) {
      await refreshPhotos();
      onClose();
    }
  };
  return (
    <Modal
      title="Profile photo"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!file} onClick={save}>
            Save photo
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 16, alignItems: 'center' }}>
        <Avatar
          name={user.name}
          id={preview ? undefined : user.employeeId}
          hasPhoto={user.hasPhoto}
          src={preview || (!user.employeeId ? user.photoUrl : undefined)}
          size={128}
        />
        <label className="col" style={{ gap: 8 }}>
          Profile image
          <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={choose} disabled={busy} />
        </label>
        <div className="small muted">JPG, PNG or WebP · Maximum 3 MB</div>
        {error && (
          <div className="error-text" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
