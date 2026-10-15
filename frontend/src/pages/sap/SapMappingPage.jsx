import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import PageHeader from '../../ui/PageHeader.jsx';
import Tabs from '../../ui/Tabs.jsx';
import Button from '../../ui/Button.jsx';
import EmptyState from '../../ui/EmptyState.jsx';
import { useToast } from '../../ui/Toast.jsx';
import SapUpload from './SapUpload.jsx';
import SapHistory from './SapHistory.jsx';
import RunResult from './RunResult.jsx';

// Upload SAP data -> add Month, descriptions, P&L Group and Department -> download the result.
const TABS = ['upload', 'history', 'result'];

export default function SapMappingPage({ tab: asked, onTab: setTab, onOpenMaster }) {
  const tab = TABS.includes(asked) ? asked : 'upload';
  const toast = useToast();
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState([]);

  const loadRuns = () => api.sapRuns().then((list) => { setRuns(list); return list; }).catch(() => []);
  // Have the latest run ready in the Result tab.
  useEffect(() => { loadRuns().then((list) => list[0] && api.sapRun(list[0].id).then(setRun).catch(() => {})); }, []);

  function processed(r) {
    setRun(r);
    setTab('result');
    loadRuns();
    toast(`Processed ${r.summary.rows.toLocaleString('en-IN')} rows`);
  }

  async function view(id) {
    try { setRun(await api.sapRun(id)); setTab('result'); } catch (e) { toast(e.message, 'error'); }
  }

  // After deleting history: forget the shown run if it was removed.
  function deleted(ids) {
    if (run && (ids === 'all' || ids.includes(run.id))) setRun(null);
    loadRuns();
  }

  const tabs = [
    { id: 'upload', label: 'Upload' },
    { id: 'history', label: 'History', count: runs.length },
    { id: 'result', label: 'Result' },
  ];

  return (
    <>
      <PageHeader eyebrow="Processing" title="SAP Data Mapping"
        description="Upload an SAP export. Month, descriptions, P&L Group and Department are added, and the result follows the REDIFINED DATA column order." />
      <div className="page-tabs"><Tabs tabs={tabs} value={tab} onChange={setTab} label="SAP Data Mapping" /></div>

      {tab === 'upload' && <SapUpload onProcessed={processed} />}
      {tab === 'history' && <SapHistory runs={runs} activeId={run?.id} onView={view} onDeleted={deleted} />}
      {tab === 'result' && (run
        ? <RunResult key={run.id} run={run} onOpenMaster={onOpenMaster} />
        : <div className="card"><EmptyState icon="sheet" title="No result open"
            action={<Button variant="primary" icon="upload" onClick={() => setTab('upload')}>Process a file</Button>}>
            Process a file, or open one from History.
          </EmptyState></div>)}
    </>
  );
}
