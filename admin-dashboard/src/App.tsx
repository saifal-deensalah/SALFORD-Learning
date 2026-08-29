import { useEffect, useState, type FormEvent } from 'react';
import { login, logout } from './api';
import type { User } from './types';
import { ErrorBox, Field } from './ui';
import { Overview } from './pages/Overview';
import { Courses } from './pages/Courses';
import { Activity, Catalog, Payments, Plans, Users } from './pages/Management';
const pages = [
  ['overview', 'نظرة عامة', '◫'],
  ['courses', 'الدورات', '▤'],
  ['users', 'الطلاب', '♧'],
  ['plans', 'الخطط', '▧'],
  ['payments', 'سجل الدفعات', '≋'],
  ['catalog', 'المحتوى المساند', '▦'],
  ['activity', 'سجل النشاط', '◷'],
] as const;
type Page = (typeof pages)[number][0];
export function App() {
  const [user, setUser] = useState<User>();
  const [page, setPage] = useState<Page>('overview');
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const expired = () => {
      setUser(undefined);
      setToast('انتهت الجلسة. سجّل الدخول مجددًا.');
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const go = (value: Page) => {
    setPage(value);
    setMenu(false);
    window.scrollTo(0, 0);
  };
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          setPage('overview');
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go('overview');
          }}
        >
          <span className="brand-mark">S</span>
          <span>
            SALFORD<small>LEARNING ADMIN</small>
          </span>
        </a>
        <span className="nav-caption">مساحة الإدارة</span>
        <nav aria-label="التنقل الرئيسي">
          {pages.map(([id, title, icon]) => (
            <button
              key={id}
              className={page === id ? 'selected' : ''}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <span aria-hidden="true">{icon}</span>
              {title}
              {page === id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          <strong>الدفع الوهمي فقط</strong>
          <p>مكان الدفع الوحيد هو تطبيق الموبايل.</p>
        </div>
        <div className="sidebar-user">
          <span className="avatar">{user.name.slice(0, 1)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>مدير المنصة</small>
          </div>
          <button
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
            disabled={exiting}
            onClick={async () => {
              setExiting(true);
              try {
                await logout();
              } catch {
                /* Local credentials are always cleared. */
              } finally {
                setUser(undefined);
                setExiting(false);
              }
            }}
          >
            ↪
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="إغلاق القائمة"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="menu-toggle"
              aria-label="فتح القائمة"
              onClick={() => setMenu(!menu)}
            >
              ☰
            </button>
            <span>مساحة العمل</span>
            <span>/</span>
            <strong>{pages.find((p) => p[0] === page)?.[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span className="status-dot" /> بيئة تجريبية
            </span>
            <span className="avatar small-avatar">{user.name.slice(0, 1)}</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">SALFORD / ADMIN</span>
              <h1>{pages.find((p) => p[0] === page)?.[1]}</h1>
              <p>
                {page === 'overview'
                  ? 'أهلًا بعودتك. هذه آخر مستجدات منصتك التعليمية.'
                  : 'إدارة بيانات المنصة من السيرفر مباشرة.'}
              </p>
            </div>
            <span className="today">
              {new Date().toLocaleDateString('ar-JO', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
          {page === 'overview' && <Overview onCourses={() => go('courses')} />}
          {page === 'courses' && <Courses notify={setToast} />}
          {page === 'users' && <Users notify={setToast} />}
          {page === 'plans' && <Plans notify={setToast} />}
          {page === 'payments' && <Payments />}
          {page === 'catalog' && <Catalog notify={setToast} />}
          {page === 'activity' && <Activity />}
        </main>
        <footer className="app-footer">
          <span>SALFORD Learning Platform</span>
          <span>لوحة الإدارة · الدفع محاكاة فقط</span>
        </footer>
      </div>
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </div>
  );
}
function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('admin@salford.test');
  const [password, setPassword] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onLogin(await login(email.trim(), password, key));
      setPassword('');
      setKey('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>
            SALFORD<small>LEARNING ADMIN</small>
          </span>
        </div>
        <div>
          <span className="eyebrow">A BETTER SPACE TO LEARN</span>
          <h1>
            التعلّم يبدأ هنا.
            <br />
            وأنت تدير الرحلة.
          </h1>
          <p>
            دورات، طلاب، ومحتوى تعليمي.
            <br />
            كل التفاصيل في مساحة إدارة واحدة.
          </p>
        </div>
        <small>الدفع وهمي فقط · لا تُستخدم بيانات بطاقات</small>
      </section>
      <section className="login-form-wrap">
        <form onSubmit={submit}>
          <span className="eyebrow">مرحبًا بعودتك</span>
          <h2>دخول الإدارة</h2>
          <p>استخدم حساب الأدمن الخاص بمشروع SALFORD.</p>
          <Field label="البريد الإلكتروني">
            <input
              required
              autoComplete="username"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="كلمة المرور">
            <input
              required
              autoComplete="current-password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <details>
            <summary>مفتاح الإدارة (للبيئة المنشورة فقط)</summary>
            <Field label="مفتاح الإدارة">
              <input
                type="password"
                autoComplete="off"
                dir="ltr"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </Field>
          </details>
          {error && <ErrorBox message={error} />}
          <button className="primary" disabled={busy}>
            {busy ? 'جاري الدخول…' : 'تسجيل الدخول ←'}
          </button>
          <p className="login-note">
            الجلسة محفوظة في الذاكرة فقط. إعادة تحميل الصفحة تتطلب الدخول
            مجددًا.
          </p>
        </form>
      </section>
    </div>
  );
}
