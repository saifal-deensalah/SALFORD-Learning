import { useState } from 'react';
import { api, upload } from '../api';
import {
  Badge,
  DataState,
  date,
  Empty,
  ErrorBox,
  Field,
  Modal,
  money,
  Pager,
  Search,
  useData,
} from '../ui';
import type {
  Audit,
  Category,
  Directory,
  Instructor,
  Payment,
  Plan,
  User,
} from '../types';
type Feedback = { notify: (message: string) => void };
export function Users({ notify }: Feedback) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<User>();
  const [revision, setRevision] = useState(0);
  return (
    <>
      <div className="toolbar">
        <Search onChange={setQ} placeholder="ابحث باسم الطالب أو البريد…" />
        <span className="hint">إدارة الوصول لحسابات الطلاب</span>
      </div>
      <section className="panel table-panel">
        <Pager<User>
          path={`/admin/users?q=${encodeURIComponent(q)}`}
          revision={revision}
        >
          {(rows) => (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>المستخدم</th>
                    <th>الدور</th>
                    <th>الحالة</th>
                    <th>الدورات</th>
                    <th>تاريخ الانضمام</th>
                    <th>إدارة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <small dir="ltr">{u.email}</small>
                        <small>
                          {u.emailVerified
                            ? 'البريد موثّق'
                            : 'البريد غير موثّق'}
                        </small>
                      </td>
                      <td>
                        <Badge value={u.role} />
                      </td>
                      <td>
                        <Badge value={u.status} />
                      </td>
                      <td>{u.enrollmentCount}</td>
                      <td>{date(u.createdAt)}</td>
                      <td>
                        {u.role === 'student' &&
                        ['active', 'suspended'].includes(u.status) ? (
                          <button
                            className={
                              u.status === 'active' ? 'danger-text' : ''
                            }
                            onClick={() => setSelected(u)}
                          >
                            {u.status === 'active'
                              ? 'إيقاف الحساب'
                              : 'إعادة التفعيل'}
                          </button>
                        ) : (
                          <span className="hint">محمي</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Pager>
      </section>
      {selected && (
        <Modal
          title={
            selected.status === 'active'
              ? 'إيقاف حساب الطالب'
              : 'إعادة تفعيل الحساب'
          }
          saveLabel="تأكيد"
          onClose={() => setSelected(undefined)}
          onSave={async () => {
            await api(`/admin/users/${selected.id}`, 'PATCH', {
              status: selected.status === 'active' ? 'suspended' : 'active',
            });
            setRevision((n) => n + 1);
            notify('تم تحديث حالة الحساب.');
          }}
        >
          <p>
            {selected.name} — {selected.email}
          </p>
          <p className="hint">
            إيقاف الحساب يلغي جلساته الحالية ويمنع الدخول. لا تُحذف بياناته أو
            دوراته.
          </p>
        </Modal>
      )}
    </>
  );
}
export function Payments() {
  const [q, setQ] = useState('');
  return (
    <>
      <div className="info-banner">
        <strong>سجل للعرض فقط</strong>
        <span>
          الدفع الوهمي يتم من تطبيق الموبايل. لا يوجد دفع أو تحصيل أموال من لوحة
          الإدارة.
        </span>
      </div>
      <div className="toolbar">
        <Search onChange={setQ} placeholder="ابحث باسم الطالب أو البريد…" />
      </div>
      <section className="panel table-panel">
        <Pager<Payment>
          path={`/admin/demo-payments?q=${encodeURIComponent(q)}`}
        >
          {(rows) => (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الخطة</th>
                    <th>المبلغ الوهمي</th>
                    <th>الحالة</th>
                    <th>تاريخ العملية</th>
                    <th>نهاية الوصول</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.userName}</strong>
                        <small dir="ltr">{p.userEmail}</small>
                      </td>
                      <td>{p.planName}</td>
                      <td dir="ltr">{money(p.amountMinor)}</td>
                      <td>
                        <Badge value={p.status} />
                      </td>
                      <td>{date(p.createdAt)}</td>
                      <td>
                        {date(p.periodEnd)}
                        <small>
                          {p.accessActive ? 'الوصول فعال' : 'الوصول غير فعال'}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Pager>
      </section>
    </>
  );
}
export function Plans({ notify }: Feedback) {
  const result = useData<Plan[]>('/admin/plans');
  const dir = useData<Directory>('/admin/directory');
  const [edit, setEdit] = useState<Plan>();
  return (
    <>
      <div className="info-banner">
        <strong>خطط التطبيق</strong>
        <span>
          تعديل السعر يؤثر على العمليات الجديدة فقط. جميع المبالغ وهمية، ومدة
          الاشتراك 30 يومًا.
        </span>
      </div>
      <DataState {...result} retry={result.reload}>
        <div className="plan-grid">
          {result.data?.map((p) => (
            <article className="panel plan-card" key={p.id}>
              <div className="section-title">
                <h2>{p.name}</h2>
                <Badge value={p.active ? 'active' : 'draft'} />
              </div>
              <strong className="plan-price" dir="ltr">
                {money(p.amountMinor)}
              </strong>
              <p>مبلغ تجريبي / 30 يوم</p>
              <ul>
                {p.features.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
              <p>
                {p.courseIds.length} دورات مشمولة ·{' '}
                {p.certificateEnabled ? 'مع شهادة' : 'بدون شهادة'}
              </p>
              <button disabled={!dir.data} onClick={() => setEdit(p)}>
                تعديل الخطة
              </button>
            </article>
          ))}
        </div>
      </DataState>
      {dir.error && <ErrorBox message={dir.error} retry={dir.reload} />}
      {edit && dir.data && (
        <PlanForm
          plan={edit}
          directory={dir.data}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            result.reload();
            notify('تم حفظ الخطة.');
          }}
        />
      )}
    </>
  );
}
function PlanForm({
  plan,
  directory,
  onClose,
  onSaved,
}: {
  plan: Plan;
  directory: Directory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(plan.name);
  const [features, setFeatures] = useState(plan.features.join('\n'));
  const [amount, setAmount] = useState((plan.amountMinor / 100).toFixed(2));
  const [active, setActive] = useState(plan.active);
  const [certificate, setCertificate] = useState(plan.certificateEnabled);
  const [courseIds, setCourseIds] = useState(plan.courseIds);
  return (
    <Modal
      title={`تعديل خطة ${plan.name}`}
      onClose={onClose}
      onSave={async () => {
        await api(`/admin/plans/${plan.id}`, 'PUT', {
          code: plan.code,
          name,
          features: features
            .split('\n')
            .map((v) => v.trim())
            .filter(Boolean),
          active,
          certificateEnabled: certificate,
          courseIds,
          amountMinor: Math.round(Number(amount) * 100),
        });
        onSaved();
      }}
    >
      <div className="form-grid">
        <Field label="اسم الخطة">
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="السعر الوهمي (USD)">
          <input
            required
            type="number"
            min="0"
            max="100000"
            step="0.01"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
      <Field label="المزايا (كل ميزة بسطر)">
        <textarea
          rows={4}
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
        />
      </Field>
      <div className="row-actions">
        <label className="check">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          الخطة متاحة
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={certificate}
            onChange={(e) => setCertificate(e.target.checked)}
          />
          شهادات الإكمال
        </label>
      </div>
      <h3>الدورات المشمولة</h3>
      <div className="check-grid">
        {directory.courses.map((c) => (
          <label className="check" key={c.id}>
            <input
              type="checkbox"
              checked={courseIds.includes(c.id)}
              onChange={(e) =>
                setCourseIds((ids) =>
                  e.target.checked
                    ? [...ids, c.id]
                    : ids.filter((id) => id !== c.id)
                )
              }
            />
            {c.title}
          </label>
        ))}
      </div>
      <p className="hint">
        تغطية ومزايا الخطة محمية أثناء وجود اشتراك فعال. يمكن تغيير سعر العمليات
        الجديدة أو إيقاف البيع دون سحب وصول الطلاب الحاليين.
      </p>
    </Modal>
  );
}
export function Catalog({ notify }: Feedback) {
  const result = useData<Directory>('/admin/directory');
  const [category, setCategory] = useState<Category | 'new'>();
  const [instructor, setInstructor] = useState<Instructor | 'new'>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saved = () => {
    result.reload();
    notify('تم حفظ المحتوى.');
  };
  return (
    <DataState {...result} retry={result.reload}>
      {result.data && (
        <>
          <div className="catalog-grid">
            <section className="panel">
              <div className="section-title">
                <h2>التصنيفات</h2>
                <button onClick={() => setCategory('new')}>+ تصنيف</button>
              </div>
              {result.data.categories.map((c) => (
                <div className="list-row" key={c.id}>
                  <div>
                    <strong>{c.name}</strong>
                    <small>{c.active ? 'فعال' : 'غير فعال'}</small>
                  </div>
                  <button onClick={() => setCategory(c)}>تعديل</button>
                </div>
              ))}
            </section>
            <section className="panel">
              <div className="section-title">
                <h2>المدرّسون</h2>
                <button onClick={() => setInstructor('new')}>+ مدرّس</button>
              </div>
              {result.data.instructors.map((i) => (
                <div className="list-row" key={i.id}>
                  <div>
                    <strong>{i.name}</strong>
                    <small>{i.bio.slice(0, 75)}</small>
                  </div>
                  <button onClick={() => setInstructor(i)}>تعديل</button>
                </div>
              ))}
            </section>
          </div>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>مكتبة الملفات</h2>
                <p>ارفع الصور والفيديوهات ثم اخترها في محرر الدورة.</p>
              </div>
              <button onClick={result.reload}>تحديث الحالات</button>
            </div>
            <label className={`upload-box ${busy ? 'disabled' : ''}`}>
              <strong>
                {busy ? 'جاري رفع الملف ومعالجته…' : 'اختر صورة أو فيديو للرفع'}
              </strong>
              <span>صورة PNG / JPEG / WebP حتى 5MB · فيديو MP4 حتى 100MB</span>
              <input
                disabled={busy}
                type="file"
                aria-label="رفع صورة أو فيديو"
                accept="image/png,image/jpeg,image/webp,video/mp4"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setBusy(true);
                  setError('');
                  try {
                    await upload(file);
                    saved();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {error && <ErrorBox message={error} />}
            {result.data.assets.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>الملف</th>
                      <th>النوع</th>
                      <th>الحالة</th>
                      <th>تاريخ الرفع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.assets.map((a) => (
                      <tr key={a.id}>
                        <td dir="ltr">{a.id.slice(0, 8)}</td>
                        <td>{a.mimeType}</td>
                        <td>
                          <Badge value={a.status} />
                        </td>
                        <td>{date(a.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
            <p className="hint">
              الفيديو قد يحتاج وقتًا للمعالجة. اضغط «تحديث الحالات» قبل اختياره
              داخل دورة.
            </p>
          </section>
          {category && (
            <CategoryForm
              value={category}
              onClose={() => setCategory(undefined)}
              onSaved={saved}
            />
          )}
          {instructor && (
            <InstructorForm
              value={instructor}
              onClose={() => setInstructor(undefined)}
              onSaved={saved}
            />
          )}
        </>
      )}
    </DataState>
  );
}
function CategoryForm({
  value,
  onClose,
  onSaved,
}: {
  value: Category | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(value === 'new' ? '' : value.name);
  const [slug, setSlug] = useState('');
  const [active, setActive] = useState(value === 'new' || value.active);
  return (
    <Modal
      title={value === 'new' ? 'إضافة تصنيف' : 'تعديل التصنيف'}
      onClose={onClose}
      onSave={async () => {
        await api(
          value === 'new'
            ? '/admin/categories'
            : `/admin/categories/${value.id}`,
          value === 'new' ? 'POST' : 'PATCH',
          value === 'new' ? { name, slug } : { name, active }
        );
        onSaved();
      }}
    >
      <Field label="اسم التصنيف">
        <input
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      {value === 'new' ? (
        <Field label="الاسم في الرابط">
          <input
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            dir="ltr"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </Field>
      ) : (
        <label className="check">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          التصنيف فعال
        </label>
      )}
    </Modal>
  );
}
function InstructorForm({
  value,
  onClose,
  onSaved,
}: {
  value: Instructor | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(value === 'new' ? '' : value.name);
  const [bio, setBio] = useState(value === 'new' ? '' : value.bio);
  return (
    <Modal
      title={value === 'new' ? 'إضافة مدرّس' : 'تعديل المدرّس'}
      onClose={onClose}
      onSave={async () => {
        await api(
          value === 'new'
            ? '/admin/instructors'
            : `/admin/instructors/${value.id}`,
          value === 'new' ? 'POST' : 'PATCH',
          { name, bio }
        );
        onSaved();
      }}
    >
      <Field label="اسم المدرّس">
        <input
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="نبذة">
        <textarea
          maxLength={2000}
          rows={5}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
export function Activity() {
  return (
    <section className="panel table-panel">
      <Pager<Audit> path="/admin/audit">
        {(rows) => (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>الإجراء</th>
                  <th>نوع السجل</th>
                  <th>المعرّف</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>{a.actorName}</td>
                    <td>{a.action}</td>
                    <td>{a.resourceType}</td>
                    <td dir="ltr">{a.resourceId?.slice(0, 8) || '—'}</td>
                    <td>{date(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Pager>
    </section>
  );
}
