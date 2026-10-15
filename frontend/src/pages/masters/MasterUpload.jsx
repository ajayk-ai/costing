import { api } from '../../api.js';
import Card from '../../ui/Card.jsx';
import Button from '../../ui/Button.jsx';
import UploadForm from './UploadForm.jsx';

export default function MasterUpload({ master, onDone, onViewRecords }) {
  const cols = master.columns;
  return (
    <div className="split">
      <Card title={`Upload to ${master.label}`} icon="upload"
        subtitle={`If the file has a "${master.label}" tab it is used, otherwise the first sheet.`}>
        <UploadForm master={master} onDone={onDone}
          after={<Button variant="ghost" onClick={onViewRecords}>View records</Button>} />
      </Card>

      <Card title="File format" icon="columns">
        {cols.length ? (
          <>
            <p className="hint">The header row should have these columns. Case, spaces and punctuation are ignored.</p>
            <ol className="steps compact">{cols.map((c) => <li key={c.key}><b>{c.label}</b></li>)}</ol>
            <Button icon="download" href={api.templateUrl(master.type)}>Download template</Button>
          </>
        ) : (
          <p className="hint">This master has no fixed columns. The first row of the sheet is used as the column headings.</p>
        )}
        <p className="hint">
          {master.keyed
            ? 'One row per code. With Merge, a blank cell never overwrites an existing value.'
            : 'Mapping table: the same code may appear more than once; exact duplicate rows are dropped.'}
        </p>
      </Card>
    </div>
  );
}
