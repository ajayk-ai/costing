import { useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { IconButton } from './Button.jsx';

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

// Drag-and-drop area for one Excel file; click or Enter opens the file picker.
export default function FileDrop({ file, onFile, accept = '.xlsx,.xlsm', disabled, hint }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const browse = () => !disabled && input.current.click();

  return (
    <div
      className={`drop${over ? ' over' : ''}${file ? ' has-file' : ''}${disabled ? ' disabled' : ''}`}
      role="button" tabIndex={disabled ? -1 : 0} aria-label={file ? `Selected ${file.name}. Choose another file` : 'Choose an Excel file'}
      onClick={browse}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); browse(); } }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
    >
      <input ref={input} type="file" accept={accept} hidden
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; }} />
      <span className="drop-icon"><Icon name={file ? 'sheet' : 'upload'} size={22} /></span>
      {file ? (
        <div className="drop-text"><b>{file.name}</b><span>{mb(file.size)} · click to choose another file</span></div>
      ) : (
        <div className="drop-text"><b>Drop an Excel file here, or <u>browse</u></b><span>{hint || '.xlsx files'}</span></div>
      )}
      {file && !disabled && <IconButton icon="x" label="Remove file" onClick={(e) => { e.stopPropagation(); onFile(null); }} />}
    </div>
  );
}
