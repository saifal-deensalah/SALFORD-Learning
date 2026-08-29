import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from 'react';
import { api } from './api';
import type { Page } from './types';
export const money = (amount: number) =>
  new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(
    amount / 100
  );
export const date = (value: string) =>
  new Date(value).toLocaleDateString('ar-JO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
export const labels: Record<string, string> = {
  published: 'منشورة',
  draft: 'مسودة',
  archived: 'مؤرشفة',
  active: 'فعال',
  suspended: 'موقوف',
  deleted: 'محذوف',
  deletion_pending: 'بانتظار الحذف',
  succeeded: 'نجحت · وهمية',
  failed: 'فشلت',
  refunded: 'ملغاة',
  ready: 'جاهز',
  processing: 'قيد المعالجة',
  pending: 'قيد الانتظار',
  admin: 'أدمن',
  student: 'طالب',
  free: 'مجانية',
  subscription: 'اشتراك',
};
export function Badge({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{labels[value] || value}</span>;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({ text = 'لا توجد بيانات لعرضها.' }: { text?: string }) {
  return (
    <div className="empty">
      <span>◇</span>
      <p>{text}</p>
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error" role="alert">
      {message}
      {retry && (
        <button className="text-button" onClick={retry}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
export function useData<T>(path: string, revision = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(undefined);
    api<T>(path)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
export function DataState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  children: ReactNode;
}) {
  return loading ? (
    <div className="loading" role="status">
      جاري تحميل البيانات…
    </div>
  ) : error ? (
    <ErrorBox message={error} retry={retry} />
  ) : (
    <>{children}</>
  );
}
export function Pager<T>({
  path,
  revision = 0,
  children,
}: {
  path: string;
  revision?: number;
  children: (items: T[]) => ReactNode;
}) {
  return <Pages<T> key={`${path}:${revision}`} path={path}>{children}</Pages>;
}
function Pages<T>({path, children}: {path: string; children: (items: T[]) => ReactNode}) {
  const [cursor, setCursor] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const result = useData<Page<T>>(
    `${path}${path.includes('?') ? '&' : '?'}limit=12${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
    }`,
    0
  );
  return (
    <DataState {...result} retry={result.reload}>
      {result.data && (
        <>
          {result.data.items.length ? children(result.data.items) : <Empty />}
          <div className="pagination">
            <span>صفحة {cursors.length + 1}</span>
            <button
              disabled={!cursors.length}
              onClick={() => {
                setCursor(cursors.at(-1) || '');
                setCursors((v) => v.slice(0, -1));
              }}
            >
              السابق
            </button>
            <button
              disabled={!result.data.nextCursor}
              onClick={() => {
                setCursors((v) => [...v, cursor]);
                setCursor(result.data!.nextCursor!);
              }}
            >
              التالي
            </button>
          </div>
        </>
      )}
    </DataState>
  );
}
export function Search({
  onChange,
  placeholder = 'ابحث بالاسم…',
}: {
  onChange: (q: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    const id = setTimeout(() => onChange(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text, onChange]);
  return (
    <input
      className="search"
      type="search"
      aria-label={placeholder}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}
export function Modal({
  title,
  onClose,
  onSave,
  children,
  saveLabel = 'حفظ التغييرات',
}: {
  title: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  children: ReactNode;
  saveLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-label={title}
    >
      <form onSubmit={submit}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            aria-label="إغلاق"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <fieldset disabled={busy} className="modal-body">
          {children}
        </fieldset>
        {error && <ErrorBox message={error} />}
        <footer className="modal-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            إلغاء
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'جاري الحفظ…' : saveLabel}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
