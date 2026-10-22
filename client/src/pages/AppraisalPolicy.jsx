import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useApp } from '../context.jsx';
import { api } from '../lib/api.js';
import { useAction, useApi } from '../lib/hooks.js';
import { Card, Badge, Button, ErrorBox, Loading, Modal, SimpleMarkdown, Textarea } from '../components/ui.jsx';

export const SAMPLE_APPRAISAL_POLICY = `## Purpose
This sample policy describes how employee contributions, goals and development needs can be reviewed during an appraisal cycle.

## Review cycle
HR announces the review period and deadlines. Employees and reporting managers agree on goals at the beginning of each cycle and discuss progress regularly.

## Evaluation criteria
- Achievement of agreed goals and quality of work.
- Ownership, teamwork and communication.
- Role-specific skills, learning and professional development.

## Appraisal workflow
- Employee updates goal progress and submits a self review.
- Reporting manager reviews achievements and provides a rating with feedback.
- HR and management review the recommendations for consistency.
- Manager discusses the outcome and development plan with the employee.

## Ratings and feedback
Use the performance review's rating scale and support feedback with examples. Employees may discuss questions about their review with their manager or HR.

## Compensation and promotion
Any salary revision or promotion is subject to management approval, role requirements and the available budget. An appraisal does not automatically guarantee a salary increase or promotion.

## Development and follow-up
Agree on learning goals, support required and a follow-up date. Record the next cycle's goals in the Performance section.

## Policy review
HR can replace this sample with the company's approved appraisal policy.`;

export default function AppraisalPolicy() {
  const { isHR, toast } = useApp();
  const list = useApi('/policies');
  const selected = list.data?.items.find(policy => policy.title.toLowerCase() === 'appraisal policy');
  const detail = useApi(selected ? `/policies/${selected.id}` : null);
  const [draft, setDraft] = useState(null);
  const [run, busy] = useAction(toast);
  const error = list.error || detail.error;
  if (error) return <ErrorBox error={error} onRetry={() => { list.reload(); detail.reload(); }} />;
  if (!list.data || (selected && !detail.data)) return <Loading />;
  const policy = detail.data;
  const content = (policy?.content ?? SAMPLE_APPRAISAL_POLICY).replace(/\\n/g, '\n');
  const save = async () => {
    if (busy || !draft?.trim()) return;
    const payload = {
      title: 'Appraisal Policy', category: policy?.category || 'HR',
      summary: policy?.summary || 'Appraisal process, evaluation criteria, feedback and development planning.',
      content: draft, requires_ack: policy ? Boolean(policy.requires_ack) : false,
    };
    if (await run(() => selected ? api.put(`/policies/${selected.id}`, payload) : api.post('/policies', payload), 'Appraisal policy saved')) {
      setDraft(null);
      list.reload();
      detail.reload();
    }
  };
  return (
    <>
      <Card title="Appraisal Policy" action={<div className="row gap-6">{!selected && <Badge tone="amber">Sample</Badge>}{isHR && <Button icon={Pencil} onClick={() => setDraft(content)}>Edit policy</Button>}</div>}>
        {!selected && <p className="small muted mb-16">Sample content for review. HR or an administrator can edit and save the company policy here.</p>}
        <SimpleMarkdown text={content} />
      </Card>
      {draft !== null && <Modal title="Edit appraisal policy" size="wide" onClose={() => { if (!busy) setDraft(null); }} footer={<><Button disabled={busy} onClick={() => setDraft(null)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!draft.trim()} onClick={save}>Save policy</Button></>}>
        <p className="small muted mb-12">Use ## for headings and - for bullet points. Saved changes are shared with employees.</p>
        <Textarea aria-label="Appraisal policy content" value={draft} onChange={event => setDraft(event.target.value)} rows={20} maxLength={50000} />
      </Modal>}
    </>
  );
}
