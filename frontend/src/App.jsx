import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Topbar from './layout/Topbar.jsx';
import Sidebar from './layout/Sidebar.jsx';
import SapMappingPage from './pages/sap/SapMappingPage.jsx';
import MasterPage from './pages/masters/MasterPage.jsx';
import UploadDialog from './pages/masters/UploadDialog.jsx';
import Alert from './ui/Alert.jsx';
import { ToastProvider } from './ui/Toast.jsx';

const SAP = 'sap'; // the SAP Data Mapping page; every other view is a master type
// URL hash: #<view>/<tab>, e.g. #sap/history or #pl_group/upload
const initialRoute = () => {
  const [view, tab] = location.hash.slice(1).split('/');
  return { view: view || SAP, tab: tab || '' };
};

export default function App() {
  const [masters, setMasters] = useState([]);
  const [route, setRoute] = useState(initialRoute);
  const { view, tab } = route;
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [workbookOpen, setWorkbookOpen] = useState(false);
  const [version, setVersion] = useState(0); // bumps after any change so views reload

  const loadMasters = useCallback(async () => {
    try {
      const list = await api.masters();
      setMasters(list);
      setRoute((r) => (r.view === SAP || list.some((m) => m.type === r.view) ? r : { view: SAP, tab: '' }));
      setError('');
    } catch (e) {
      setError(`Cannot reach the server: ${e.message}. Is the backend running?`);
    }
  }, []);

  useEffect(() => { loadMasters(); }, [loadMasters]);
  useEffect(() => { history.replaceState(null, '', `#${view}${tab ? `/${tab}` : ''}`); }, [view, tab]);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  const navigate = (v) => { setRoute({ view: v, tab: '' }); setMenuOpen(false); };
  const setTab = (t) => setRoute((r) => ({ ...r, tab: t }));
  const changed = () => { loadMasters(); setVersion((v) => v + 1); };
  const master = masters.find((m) => m.type === view);

  return (
    <ToastProvider>
      <div className="app">
        <Topbar onMenu={() => setMenuOpen(true)} onUploadWorkbook={() => setWorkbookOpen(true)} />
        <div className="layout">
          <Sidebar masters={masters} view={view} sapView={SAP} onNavigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} />
          <main className="content">
            {error && <Alert tone="error" title="Connection problem">{error}</Alert>}
            {view === SAP && <SapMappingPage tab={tab || 'upload'} onTab={setTab} onOpenMaster={navigate} />}
            {master && <MasterPage key={master.type} master={master} tab={tab || 'records'} onTab={setTab} version={version} onChanged={changed} />}
          </main>
        </div>
        {workbookOpen && <UploadDialog onClose={() => setWorkbookOpen(false)} onDone={changed} />}
      </div>
    </ToastProvider>
  );
}
