import { useCallback, useEffect, useState } from 'react';
import { api, fmt } from './api.js';
import MasterView from './components/MasterView.jsx';
import SapView from './components/SapView.jsx';
import UploadDialog from './components/UploadDialog.jsx';

const SAP = 'sap'; // the SAP Data Mapping page; every other value is a master type
const initialView = () => location.hash.slice(1) || SAP;

export default function App() {
  const [masters, setMasters] = useState([]);
  const [view, setView] = useState(initialView);
  const [error, setError] = useState('');
  const [workbookOpen, setWorkbookOpen] = useState(false);
  const [version, setVersion] = useState(0); // bumps after any change so views reload

  const loadMasters = useCallback(async () => {
    try {
      const list = await api.masters();
      setMasters(list);
      setView((v) => (v === SAP || list.some((m) => m.type === v) ? v : SAP));
      setError('');
    } catch (e) {
      setError(`Cannot reach the API: ${e.message}. Is the backend running?`);
    }
  }, []);

  useEffect(() => { loadMasters(); }, [loadMasters]);
  useEffect(() => { history.replaceState(null, '', `#${view}`); }, [view]);

  const changed = () => { loadMasters(); setVersion((v) => v + 1); };
  const groups = [...new Set(masters.map((m) => m.group))];
  const master = masters.find((m) => m.type === view);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Costing <span>Master Data</span></div>
        <button className="btn on-dark" onClick={() => setWorkbookOpen(true)} title="Upload the whole expense report; every master tab found in it is updated">
          Upload full workbook
        </button>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label="Navigation">
          <select className="mobile-picker" value={view} onChange={(e) => setView(e.target.value)}>
            <optgroup label="Processing"><option value={SAP}>SAP Data Mapping</option></optgroup>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {masters.filter((m) => m.group === g).map((m) => <option key={m.type} value={m.type}>{m.label} ({fmt(m.count)})</option>)}
              </optgroup>
            ))}
          </select>
          <div className="nav-group">
            <div className="nav-title">Processing</div>
            <button className="nav-item" aria-current={view === SAP ? 'page' : undefined} onClick={() => setView(SAP)}>
              <span>SAP Data Mapping</span>
            </button>
          </div>
          {groups.map((g) => (
            <div className="nav-group" key={g}>
              <div className="nav-title">{g}</div>
              {masters.filter((m) => m.group === g).map((m) => (
                <button key={m.type} className="nav-item" aria-current={m.type === view ? 'page' : undefined} onClick={() => setView(m.type)}>
                  <span>{m.label}</span>
                  <span className={`badge${m.count ? '' : ' zero'}`}>{fmt(m.count)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="content">
          {error && <div className="banner error">{error}</div>}
          {view === SAP && <SapView onOpenMaster={setView} />}
          {master && <MasterView key={master.type} master={master} version={version} onChanged={changed} />}
        </main>
      </div>

      {workbookOpen && <UploadDialog workbook onClose={() => setWorkbookOpen(false)} onDone={changed} />}
    </div>
  );
}
