import Button, { IconButton } from '../ui/Button.jsx';

export default function Topbar({ onMenu, onUploadWorkbook }) {
  return (
    <header className="topbar">
      <IconButton icon="menu" label="Open menu" className="menu-btn" onClick={onMenu} />
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">C</span>
        <span>Costing <span className="brand-sub">Master Data</span></span>
      </div>
      <Button variant="on-dark" icon="upload" onClick={onUploadWorkbook}
        title="Upload the whole expense report; every master tab found in it is updated">
        <span className="hide-sm">Upload full workbook</span>
      </Button>
    </header>
  );
}
