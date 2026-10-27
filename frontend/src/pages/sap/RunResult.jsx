import { useState } from 'react';
import { api, fmt } from '../../api.js';
import Card from '../../ui/Card.jsx';
import Button from '../../ui/Button.jsx';
import StatCard from '../../ui/StatCard.jsx';
import Tabs from '../../ui/Tabs.jsx';
import Alert from '../../ui/Alert.jsx';
import RuleSteps from './RuleSteps.jsx';
import DescriptionTable from './DescriptionTable.jsx';
import ColumnOrder from './ColumnOrder.jsx';
import PreviewTable from './PreviewTable.jsx';
import AiCheck from './AiCheck.jsx';
import F1Check from './F1Check.jsx';

// Result of one processing run: headline numbers, then details in tabs.
export default function RunResult({ run, onOpenMaster }) {
  const s = run.summary;
  const [tab, setTab] = useState('rules');
  const share = (n) => (s.rows ? (n / s.rows) * 100 : 0);
  const descGaps = s.descriptions.filter((d) => d.missingRows).length;
  const f1 = s.f1 || null;  // null for runs made before the F1 columns
  const ai = s.ai && s.ai.enabled ? s.ai : null;  // null for runs made without the AI check

  const tabs = [
    { id: 'rules', label: 'Department rules', count: s.unfilled || null, tone: 'warn' },
    { id: 'descriptions', label: 'Descriptions', count: descGaps || null, tone: 'warn' },
    ...(f1 ? [{ id: 'f1', label: 'F1 check', count: f1.overhead.missingRows || null, tone: 'warn' }] : []),
    ...(ai ? [{ id: 'ai', label: 'AI check', count: ai.counts.REVIEW || null, tone: 'danger' }] : []),
    { id: 'columns', label: 'Columns', count: s.header.length },
    { id: 'preview', label: 'Preview' },
  ];

  return (
    <Card className="run-result" icon="sheet" title={run.fileName || 'SAP data'}
      subtitle={`Processed ${run.createdAt} · sheet "${s.sheet}"`}
      actions={<>
        {run.hasFull && <Button icon="sheet" href={api.sapDownloadFullUrl(run.id)}
          title="One Excel file with REDEFINED DATA, SAP DATA, all masters and the Summary">Download full workbook</Button>}
        <Button variant="primary" icon="download" href={api.sapDownloadUrl(run.id)}>Download result .xlsx</Button>
      </>}>
      <div className="stats">
        <StatCard label="Rows" value={fmt(s.rows)} hint={`${s.header.length} columns in the result`} />
        <StatCard label="Department filled" value={fmt(s.filled)} tone="ok" progress={share(s.filled)} hint={`${(Math.floor(share(s.filled) * 10) / 10).toFixed(1)}% of rows`} />
        <StatCard label="Department blank" value={fmt(s.unfilled)} tone={s.unfilled ? 'warn' : 'ok'}
          hint={s.unfilled ? 'see Department rules below' : 'every row has a department'} />
        <StatCard label="Descriptions with gaps" value={fmt(descGaps)} tone={descGaps ? 'warn' : 'ok'}
          hint={descGaps ? 'codes missing from a master' : 'all codes found'} />
        {ai && <StatCard label="AI review" value={fmt(ai.counts.REVIEW)} tone={ai.counts.REVIEW ? 'danger' : 'ok'}
          hint={`${fmt(ai.counts.WATCH)} more to watch · see AI check`} />}
      </div>

      {s.notes.length > 0 && (
        <Alert tone="info" title="Notes">
          <ul className="plain">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Alert>
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Run details" />
      <div className="tab-panel" role="tabpanel">
        {tab === 'rules' && <RuleSteps summary={s} onOpenMaster={onOpenMaster} />}
        {tab === 'descriptions' && <DescriptionTable descriptions={s.descriptions} onOpenMaster={onOpenMaster} />}
        {tab === 'f1' && f1 && <F1Check f1={f1} rows={s.rows} />}
        {tab === 'ai' && ai && <AiCheck ai={ai} rows={s.rows} />}
        {tab === 'columns' && <ColumnOrder header={s.header} />}
        {tab === 'preview' && <PreviewTable header={s.header} preview={run.preview} unfilled={s.unfilled} ai={ai} />}
      </div>
    </Card>
  );
}
