import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Modal, Button, Input } from '../ui';
import { swal } from '../../lib/swalTheme';
import type { CloudClient } from '../../lib/cloudClient';
import type { AutomationTrigger, AutomationAction } from '../../types';

const INTERVAL_PRESETS = [
  { label: 'Hourly', ms: 60 * 60 * 1000 },
  { label: 'Daily', ms: 24 * 60 * 60 * 1000 },
  { label: 'Weekly', ms: 7 * 24 * 60 * 60 * 1000 },
];

interface ScheduleTransferModalProps {
  open: boolean;
  onClose: () => void;
  cc: CloudClient;
  createAutomation: (input: { name: string; description: string; trigger: AutomationTrigger; action: AutomationAction }) => void;
}

export function ScheduleTransferModal({ open, onClose, cc, createAutomation }: ScheduleTransferModalProps) {
  const [cloudFileId, setCloudFileId] = useState<number | ''>('');
  const [timing, setTiming] = useState<'now' | 'at' | 'interval'>('now');
  const [atValue, setAtValue] = useState('');
  const [intervalMs, setIntervalMs] = useState(INTERVAL_PRESETS[1].ms);

  const reset = () => {
    setCloudFileId('');
    setTiming('now');
    setAtValue('');
    setIntervalMs(INTERVAL_PRESETS[1].ms);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (cloudFileId === '') {
      swal({ icon: 'error', title: 'No Backup', text: 'Choose a cloud backup to schedule.' });
      return;
    }
    const target = cc.files.find(f => f.id === cloudFileId);
    if (!target) return;
    const action: AutomationAction = { type: 'cloudTransfer', direction: 'download', fileName: target.name, sizeBytes: target.sizeBytes, folderId: target.folderId, cloudFileId: target.id };
    const name = `Download ${target.name}`;

    let trigger: AutomationTrigger;
    if (timing === 'now') trigger = { type: 'once', at: new Date().toISOString() };
    else if (timing === 'at') {
      if (!atValue) {
        swal({ icon: 'error', title: 'Pick a Time', text: 'Choose when this transfer should run.' });
        return;
      }
      trigger = { type: 'once', at: new Date(atValue).toISOString() };
    } else {
      trigger = { type: 'interval', everyMs: intervalMs };
    }

    createAutomation({ name, description: '', trigger, action });
    handleClose();
  };

  const sizeLabel = cloudFileId !== '' ? cc.formatSize(cc.files.find(f => f.id === cloudFileId)?.sizeBytes || 0) : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Schedule Backup Download"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave}><CalendarClock size={14} /> Schedule</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-accent font-semibold">Workspace Backup</label>
          <select
            value={cloudFileId}
            onChange={(e) => setCloudFileId(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full bg-ink/5 border border-hairline rounded-xl px-4 py-2.5 text-ink text-sm outline-none focus:border-accent"
          >
            <option value="">Choose a backup...</option>
            {cc.files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>

        {sizeLabel && <p className="text-xs text-ink-faint font-mono">Size: {sizeLabel}</p>}

        <div className="space-y-2">
          <label className="text-xs text-accent font-semibold">Run</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'now', label: 'Now' },
              { id: 'at', label: 'At a time' },
              { id: 'interval', label: 'Recurring' },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setTiming(t.id)}
                className={`py-2 rounded-xl border text-xs font-medium transition-colors ${timing === t.id ? 'bg-accent-soft border-accent text-accent' : 'bg-ink/5 border-hairline text-ink-muted'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {timing === 'at' && (
            <Input type="datetime-local" value={atValue} onChange={(e) => setAtValue(e.target.value)} />
          )}
          {timing === 'interval' && (
            <div className="grid grid-cols-3 gap-2">
              {INTERVAL_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setIntervalMs(p.ms)}
                  className={`py-2 rounded-xl border text-xs font-medium transition-colors ${intervalMs === p.ms ? 'bg-accent-soft border-accent text-accent' : 'bg-ink/5 border-hairline text-ink-muted'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
