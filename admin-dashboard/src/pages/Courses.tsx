import { useState } from 'react';
import { api } from '../api';
import { Badge, DataState, Field, Modal, Pager, Search, useData } from '../ui';
import type { Course, CourseDetail, Directory, Draft } from '../types';

export function Courses({ notify }: { notify: (text: string) => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<string>();
  const [archive, setArchive] = useState<Course>();
  const dir = useData<Directory>('/admin/directory', revision);
  const changed = () => {
    setRevision((n) => n + 1);
    notify('تم حفظ تغييرات الدورة.');
  };
  return (
    <>
      <div className="toolbar">
        <Search onChange={setQ} placeholder="ابحث عن دورة أو مدرّس…" />
        <select
          aria-label="حالة الدورة"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">كل الحالات</option>
          <option value="published">منشورة</option>
          <option value="draft">مسودة</option>
          <option value="archived">مؤرشفة</option>
        </select>
        <button
          className="primary"
          disabled={!dir.data}
          onClick={() => setCreate(true)}
        >
          + إضافة دورة
        </button>
      </div>
      <section className="panel table-panel">
        <Pager<Course>
          path={`/admin/catalog?q=${encodeURIComponent(q)}${
            status ? `&status=${status}` : ''
          }`}
          revision={revision}
        >
          {(rows) => (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>الدورة</th>
                    <th>التصنيف</th>
                    <th>الحالة</th>
                    <th>الطلاب</th>
                    <th>إدارة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="course-cell">
                          {c.coverUrl && <img src={c.coverUrl} alt="" />}
                          <div>
                            <strong>{c.title}</strong>
                            <small>{c.instructorName}</small>
                          </div>
                        </div>
                      </td>
                      <td>{c.categoryName}</td>
                      <td>
                        <Badge value={c.status} />
                      </td>
                      <td>{c.enrollmentCount}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            disabled={!dir.data}
                            onClick={() => setEdit(c.id)}
                          >
                            تعديل
                          </button>
                          {c.status !== 'archived' && (
                            <button
                              className="danger-text"
                              onClick={() => setArchive(c)}
                            >
                              أرشفة
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Pager>
      </section>
      {dir.error && <p role="alert">{dir.error}</p>}
      {create && dir.data && (
        <CreateCourse
          directory={dir.data}
          onClose={() => setCreate(false)}
          onCreated={(id) => {
            changed();
            setEdit(id);
          }}
        />
      )}
      {edit && dir.data && (
        <EditCourse
          id={edit}
          directory={dir.data}
          onClose={() => setEdit(undefined)}
          onSaved={changed}
        />
      )}
      {archive && (
        <Modal
          title="أرشفة الدورة"
          saveLabel="تأكيد الأرشفة"
          onClose={() => setArchive(undefined)}
          onSave={async () => {
            await api(`/admin/courses/${archive.id}/archive`, 'POST');
            changed();
          }}
        >
          <p>
            ستختفي «{archive.title}» من الكتالوج الجديد. تبقى سجلات الطلاب
            محفوظة.
          </p>
        </Modal>
      )}
    </>
  );
}
function References({
  directory,
  value,
  change,
}: {
  directory: Directory;
  value: { categoryId: string; instructorId: string };
  change: (v: Partial<Draft>) => void;
}) {
  return (
    <div className="form-grid">
      <Field label="التصنيف">
        <select
          required
          value={value.categoryId}
          onChange={(e) => change({ categoryId: e.target.value })}
        >
          <option value="">اختر التصنيف</option>
          {directory.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!c.active ? ' (غير فعال)' : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field label="المدرّس">
        <select
          required
          value={value.instructorId}
          onChange={(e) => change({ instructorId: e.target.value })}
        >
          <option value="">اختر المدرّس</option>
          {directory.instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
function CreateCourse({
  directory,
  onClose,
  onCreated,
}: {
  directory: Directory;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({
    title: '',
    slug: '',
    categoryId: directory.categories[0]?.id || '',
    instructorId: directory.instructors[0]?.id || '',
    accessType: 'free',
    certificateEnabled: true,
  });
  return (
    <Modal
      title="إضافة دورة"
      saveLabel="إنشاء المسودة"
      onClose={onClose}
      onSave={async () => {
        const r = await api<{ courseId: string }>(
          '/admin/courses',
          'POST',
          form
        );
        onCreated(r.courseId);
      }}
    >
      <Field label="اسم الدورة">
        <input
          required
          maxLength={200}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <Field label="الاسم في الرابط (حروف إنجليزية وشرطات)">
        <input
          required
          dir="ltr"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={120}
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
        />
      </Field>
      <References
        directory={directory}
        value={form}
        change={(v) => setForm({ ...form, ...v })}
      />
      <p className="hint">
        تُنشأ الدورة كمسودة مجانية. أضف الغلاف والدروس وحدّد نوع الوصول في
        الخطوة التالية قبل النشر.
      </p>
    </Modal>
  );
}
function EditCourse({
  id,
  directory,
  onClose,
  onSaved,
}: {
  id: string;
  directory: Directory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const result = useData<CourseDetail>(`/admin/courses/${id}`);
  return (
    <DataState {...result} retry={result.reload}>
      {result.data && (
        <CourseForm
          detail={result.data}
          directory={directory}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </DataState>
  );
}
function CourseForm({
  detail,
  directory,
  onClose,
  onSaved,
}: {
  detail: CourseDetail;
  directory: Directory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(detail.draft);
  const [publish, setPublish] = useState(false);
  const patch = (value: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...value }));
  const assets = (kind: string) =>
    directory.assets.filter((a) => a.kind === kind && a.status === 'ready');
  const changeChapter = (
    index: number,
    fn: (ch: Draft['chapters'][number]) => Draft['chapters'][number]
  ) =>
    setDraft((d) => ({
      ...d,
      chapters: d.chapters.map((ch, i) => (i === index ? fn(ch) : ch)),
    }));
  return (
    <Modal
      title="تحرير الدورة"
      onClose={onClose}
      saveLabel={publish ? 'حفظ ونشر الدورة' : 'حفظ المسودة'}
      onSave={async () => {
        const saved = await api<{ versionId: string }>(
          `/admin/courses/${detail.courseId}/draft`,
          'PUT',
          draft
        );
        if (publish)
          await api(`/admin/courses/${detail.courseId}/publish`, 'POST', {
            versionId: saved.versionId,
          });
        onSaved();
      }}
    >
      <p className="hint">
        التعديلات تُحفظ كمسودة. النسخة المنشورة لا تتغير إلا عند اختيار النشر.
      </p>
      <Field label="اسم الدورة">
        <input
          required
          maxLength={200}
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </Field>
      <Field label="الوصف">
        <textarea
          rows={3}
          maxLength={20000}
          value={draft.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </Field>
      <References directory={directory} value={draft} change={patch} />
      <div className="form-grid">
        <Field label="صورة الغلاف">
          <select
            required
            value={draft.coverAssetId || ''}
            onChange={(e) => patch({ coverAssetId: e.target.value })}
          >
            <option value="">اختر صورة جاهزة</option>
            {assets('image').map((a) => (
              <option key={a.id} value={a.id}>
                صورة · {a.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الوصول">
          <select
            value={draft.accessType}
            onChange={(e) =>
              patch({ accessType: e.target.value as Draft['accessType'] })
            }
          >
            <option value="free">مجانية</option>
            <option value="subscription">اشتراك</option>
          </select>
        </Field>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.certificateEnabled}
          onChange={(e) => patch({ certificateEnabled: e.target.checked })}
        />
        شهادة إكمال
      </label>
      <div className="section-title">
        <h3>الفصول والدروس</h3>
        <button
          type="button"
          onClick={() =>
            patch({
              chapters: [...draft.chapters, { title: 'فصل جديد', lessons: [] }],
            })
          }
        >
          + فصل
        </button>
      </div>
      {draft.chapters.map((ch, index) => (
        <div className="chapter" key={index}>
          <div className="inline-fields">
            <Field label={`الفصل ${index + 1}`}>
              <input
                required
                maxLength={200}
                value={ch.title}
                onChange={(e) =>
                  changeChapter(index, (v) => ({ ...v, title: e.target.value }))
                }
              />
            </Field>
            <button
              type="button"
              className="danger-text"
              onClick={() =>
                patch({
                  chapters: draft.chapters.filter((_, i) => i !== index),
                })
              }
            >
              حذف الفصل
            </button>
          </div>
          {ch.lessons.map((l, li) => (
            <div className="lesson" key={li}>
              <Field label={`عنوان الدرس ${li + 1}`}>
                <input
                  required
                  maxLength={200}
                  value={l.title}
                  onChange={(e) =>
                    changeChapter(index, (v) => ({
                      ...v,
                      lessons: v.lessons.map((a, j) =>
                        j === li ? { ...a, title: e.target.value } : a
                      ),
                    }))
                  }
                />
              </Field>
              <Field label="الفيديو">
                <select
                  required
                  value={l.mediaAssetId}
                  onChange={(e) =>
                    changeChapter(index, (v) => ({
                      ...v,
                      lessons: v.lessons.map((a, j) =>
                        j === li ? { ...a, mediaAssetId: e.target.value } : a
                      ),
                    }))
                  }
                >
                  <option value="">اختر فيديو جاهز</option>
                  {assets('video').map((a) => (
                    <option key={a.id} value={a.id}>
                      فيديو · {a.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="وصف الدرس">
                <textarea
                  rows={2}
                  maxLength={20000}
                  value={l.description}
                  onChange={(e) =>
                    changeChapter(index, (v) => ({
                      ...v,
                      lessons: v.lessons.map((a, j) =>
                        j === li ? { ...a, description: e.target.value } : a
                      ),
                    }))
                  }
                />
              </Field>
              <div className="row-actions">
                {(['required', 'isPreview'] as const).map((key) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={l[key]}
                      onChange={(e) =>
                        changeChapter(index, (v) => ({
                          ...v,
                          lessons: v.lessons.map((a, j) =>
                            j === li ? { ...a, [key]: e.target.checked } : a
                          ),
                        }))
                      }
                    />
                    {key === 'required' ? 'مطلوب للإكمال' : 'معاينة مجانية'}
                  </label>
                ))}
                <button
                  type="button"
                  className="danger-text"
                  onClick={() =>
                    changeChapter(index, (v) => ({
                      ...v,
                      lessons: v.lessons.filter((_, j) => j !== li),
                    }))
                  }
                >
                  حذف الدرس
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              changeChapter(index, (v) => ({
                ...v,
                lessons: [
                  ...v.lessons,
                  {
                    title: '',
                    description: '',
                    mediaAssetId: '',
                    required: true,
                    isPreview: false,
                  },
                ],
              }))
            }
          >
            + درس
          </button>
        </div>
      ))}
      <p className="hint">
        يمكن رفع الصور والفيديوهات من صفحة «المحتوى المساند». للدورات باشتراك:
        أضف الدورة إلى خطة قبل النشر.
      </p>
      <label className="check publish-check">
        <input
          type="checkbox"
          checked={publish}
          onChange={(e) => setPublish(e.target.checked)}
        />
        نشر هذه التغييرات للطلاب بعد الحفظ
      </label>
    </Modal>
  );
}
