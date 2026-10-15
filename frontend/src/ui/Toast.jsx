import { createContext, useCallback, useContext, useState } from 'react';
import Icon from './Icon.jsx';

const ToastContext = createContext(() => {});

// Short confirmation messages in the bottom-right corner. useToast()(text, tone?)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, tone = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <Icon name={t.tone === 'error' ? 'alert' : 'check'} />{t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
