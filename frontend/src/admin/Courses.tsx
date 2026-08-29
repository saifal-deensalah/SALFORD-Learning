import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../services/api';
import {
  Button,
  Data,
  Dialog,
  Field,
  Pager,
  Select,
  Toggle,
  ui,
  useData,
} from '../components/NativeUI';
import type { Course, CourseDetail, Directory, Draft } from './types';

export function Courses() {
  const [q, setQ] = useState(''),
    [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const [edit, setEdit] = useState<string>(),
    [create, setCreate] = useState(false),
    [archive, setArchive] = useState<Course>();
  const directory = useData<Directory>('/admin/directory', revision);
  const changed = () => setRevision(n => n + 1);
  return (
    <>
      <Field label="البحث عن دورة" value={q} onChange={setQ} />
      <Select
        label="حالة الدورة"
        value={status}
        onChange={setStatus}
        options={[
          { id: '', name: 'كل الحالات' },
          { id: 'published', name: 'منشورة' },
          { id: 'draft', name: 'مسودة' },
          { id: 'archived', name: 'مؤرشفة' },
        ]}
      />
      <Button
        title="إضافة دورة"
        disabled={!directory.data}
        onPress={() => setCreate(true)}
      />
      <Pager<Course>
        path={`/admin/catalog?q=${encodeURIComponent(q)}${
          status ? `&status=${status}` : ''
        }`}
        revision={revision}
        render={c => (
          <View key={c.id} style={ui.card}>
            <Text style={ui.subtitle}>{c.title}</Text>
            <Text style={ui.note}>
              {c.categoryName} · {c.instructorName}
            </Text>
            <Text style={ui.note}>
              {c.status} · {c.enrollmentCount} طالب
            </Text>
            <Button
              secondary
              title="تحرير الدورة"
              onPress={() => setEdit(c.id)}
            />
            {c.status !== 'archived' && (
              <Button secondary title="أرشفة" onPress={() => setArchive(c)} />
            )}
          </View>
        )}
      />
      <Data result={directory}>
        {dir => (
          <>
            {create && (
              <Create
                directory={dir}
                close={() => setCreate(false)}
                created={id => {
                  changed();
                  setEdit(id);
                }}
              />
            )}
            {edit && (
              <Edit
                id={edit}
                directory={dir}
                close={() => setEdit(undefined)}
                saved={changed}
              />
            )}
          </>
        )}
      </Data>
      {archive && (
        <Dialog
          title="تأكيد الأرشفة"
          onClose={() => setArchive(undefined)}
          onSave={async () => {
            await api(`/admin/courses/${archive.id}/archive`, 'POST');
            changed();
          }}
        >
          <Text style={ui.note}>
            ستختفي «{archive.title}» من الكتالوج. تبقى سجلات الطلاب محفوظة.
          </Text>
        </Dialog>
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
    <>
      <Select
        label="التصنيف"
        options={directory.categories.map(c => ({
          id: c.id,
          name: `${c.name}${c.active ? '' : ' (غير فعال)'}`,
        }))}
        value={value.categoryId}
        onChange={categoryId => change({ categoryId })}
      />
      <Select
        label="المدرّس"
        options={directory.instructors}
        value={value.instructorId}
        onChange={instructorId => change({ instructorId })}
      />
    </>
  );
}
function Create({
  directory,
  close,
  created,
}: {
  directory: Directory;
  close: () => void;
  created: (id: string) => void;
}) {
  const [form, setForm] = useState({
    title: '',
    slug: '',
    categoryId: directory.categories.find(c => c.active)?.id || '',
    instructorId: directory.instructors[0]?.id || '',
    accessType: 'free' as const,
    certificateEnabled: true,
  });
  return (
    <Dialog
      title="إضافة دورة"
      onClose={close}
      saveLabel="إنشاء مسودة"
      onSave={async () => {
        if (
          !form.title.trim() ||
          !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug) ||
          !form.categoryId ||
          !form.instructorId
        ) {
          throw new Error(
            'أدخل العنوان والرابط والتصنيف والمدرّس. الرابط يقبل حروف إنجليزية صغيرة وشرطات.',
          );
        }
        const value = await api<{ courseId: string }>(
          '/admin/courses',
          'POST',
          form,
        );
        created(value.courseId);
      }}
    >
      <Field
        label="عنوان الدورة"
        value={form.title}
        onChange={title => setForm({ ...form, title })}
      />
      <Field
        label="الرابط (english-slug)"
        value={form.slug}
        onChange={slug => setForm({ ...form, slug })}
        max={120}
      />
      <References
        directory={directory}
        value={form}
        change={v =>
          setForm({
            ...form,
            categoryId: v.categoryId ?? form.categoryId,
            instructorId: v.instructorId ?? form.instructorId,
          })
        }
      />
    </Dialog>
  );
}
function Edit({
  id,
  directory,
  close,
  saved,
}: {
  id: string;
  directory: Directory;
  close: () => void;
  saved: () => void;
}) {
  const result = useData<CourseDetail>(`/admin/courses/${id}`);
  if (!result.data) {
    return (
      <Dialog title="تحميل الدورة" onClose={close}>
        <Data result={result}>{() => null}</Data>
      </Dialog>
    );
  }
  return (
    <CourseForm
      detail={result.data}
      directory={directory}
      close={close}
      saved={saved}
    />
  );
}
function CourseForm({
  detail,
  directory,
  close,
  saved,
}: {
  detail: CourseDetail;
  directory: Directory;
  close: () => void;
  saved: () => void;
}) {
  const [draft, setDraft] = useState(detail.draft),
    [publish, setPublish] = useState(false);
  const patch = (value: Partial<Draft>) => setDraft(d => ({ ...d, ...value }));
  const chapter = (
    index: number,
    fn: (v: Draft['chapters'][number]) => Draft['chapters'][number],
  ) =>
    setDraft(d => ({
      ...d,
      chapters: d.chapters.map((v, i) => (i === index ? fn(v) : v)),
    }));
  const assets = (kind: string) =>
    directory.assets
      .filter(a => a.kind === kind && a.status === 'ready')
      .map(a => ({ id: a.id, name: `${a.mimeType} · ${a.id.slice(0, 8)}` }));
  return (
    <Dialog
      title="تحرير الدورة"
      onClose={close}
      saveLabel={publish ? 'حفظ ونشر' : 'حفظ المسودة'}
      onSave={async () => {
        if (
          !draft.title.trim() ||
          !draft.coverAssetId ||
          draft.chapters.some(
            c =>
              !c.title.trim() ||
              c.lessons.some(l => !l.title.trim() || !l.mediaAssetId),
          )
        ) {
          throw new Error(
            'أكمل العنوان والغلاف وعناوين الفصول والدروس والفيديوهات.',
          );
        }
        const value = await api<{ versionId: string }>(
          `/admin/courses/${detail.courseId}/draft`,
          'PUT',
          draft,
        );
        if (publish) {
          await api(`/admin/courses/${detail.courseId}/publish`, 'POST', {
            versionId: value.versionId,
          });
        }
        saved();
      }}
    >
      <Text style={ui.note}>
        النسخة المنشورة لا تتغير حتى تنشر المسودة. سجلات الطلاب مرتبطة بنسخة
        الدورة التي سجّلوا فيها.
      </Text>
      <Field
        label="عنوان الدورة"
        value={draft.title}
        onChange={title => patch({ title })}
      />
      <Field
        label="الوصف"
        value={draft.description}
        onChange={description => patch({ description })}
        multiline
        max={20000}
      />
      <References directory={directory} value={draft} change={patch} />
      <Select
        label="الغلاف"
        options={assets('image')}
        value={draft.coverAssetId || ''}
        onChange={coverAssetId => patch({ coverAssetId })}
      />
      <Toggle
        label="الدورة تتطلب اشتراكًا"
        value={draft.accessType === 'subscription'}
        onChange={v => patch({ accessType: v ? 'subscription' : 'free' })}
      />
      <Toggle
        label="شهادة إكمال"
        value={draft.certificateEnabled}
        onChange={certificateEnabled => patch({ certificateEnabled })}
      />
      <Button
        secondary
        title="إضافة فصل"
        onPress={() =>
          patch({ chapters: [...draft.chapters, { title: '', lessons: [] }] })
        }
      />
      {draft.chapters.map((ch, index) => (
        <View key={index} style={ui.card}>
          <Field
            label={`عنوان الفصل ${index + 1}`}
            value={ch.title}
            onChange={title => chapter(index, v => ({ ...v, title }))}
          />
          {ch.lessons.map((lesson, li) => {
            const update = (v: Partial<typeof lesson>) =>
              chapter(index, c => ({
                ...c,
                lessons: c.lessons.map((l, n) =>
                  n === li ? { ...l, ...v } : l,
                ),
              }));
            return (
              <View key={li} style={ui.card}>
                <Field
                  label={`عنوان الدرس ${li + 1}`}
                  value={lesson.title}
                  onChange={title => update({ title })}
                />
                <Field
                  label="وصف الدرس"
                  value={lesson.description}
                  onChange={description => update({ description })}
                  multiline
                  max={20000}
                />
                <Select
                  label="فيديو الدرس"
                  options={assets('video')}
                  value={lesson.mediaAssetId}
                  onChange={mediaAssetId => update({ mediaAssetId })}
                />
                <Toggle
                  label="درس مطلوب للإكمال"
                  value={lesson.required}
                  onChange={required => update({ required })}
                />
                <Toggle
                  label="معاينة مجانية"
                  value={lesson.isPreview}
                  onChange={isPreview => update({ isPreview })}
                />
                <Button
                  secondary
                  title="حذف الدرس من المسودة"
                  onPress={() =>
                    chapter(index, c => ({
                      ...c,
                      lessons: c.lessons.filter((_, n) => n !== li),
                    }))
                  }
                />
              </View>
            );
          })}
          <Button
            secondary
            title="إضافة درس"
            onPress={() =>
              chapter(index, c => ({
                ...c,
                lessons: [
                  ...c.lessons,
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
          />
          <Button
            secondary
            title="حذف الفصل من المسودة"
            onPress={() =>
              patch({ chapters: draft.chapters.filter((_, i) => i !== index) })
            }
          />
        </View>
      ))}
      <Toggle
        label="نشر المسودة بعد الحفظ"
        value={publish}
        onChange={setPublish}
      />
    </Dialog>
  );
}
