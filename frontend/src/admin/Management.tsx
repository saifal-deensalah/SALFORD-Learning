import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../services/api';
import {
  Button,
  Data,
  Dialog,
  ErrorBox,
  Field,
  Pager,
  Toggle,
  date,
  money,
  ui,
  useData,
} from '../components/NativeUI';
import type {
  User,
  Plan,
  Payment,
  Directory,
  Category,
  Instructor,
  Audit,
} from './types';
import { uploadMedia } from './upload';

export function Users() {
  const [q, setQ] = useState(''),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<User>();
  return (
    <>
      <Field label="البحث عن طالب" value={q} onChange={setQ} />
      <Pager<User>
        path={`/admin/users?q=${encodeURIComponent(q)}`}
        revision={revision}
        render={user => (
          <View key={user.id} style={ui.card}>
            <Text style={ui.subtitle}>{user.name}</Text>
            <Text style={ui.note}>{user.email}</Text>
            <Text style={ui.note}>
              {user.role} · {user.status} · {user.enrollmentCount} دورة
            </Text>
            {user.role === 'student' &&
              ['active', 'suspended'].includes(user.status) && (
                <Button
                  secondary
                  title={
                    user.status === 'active' ? 'إيقاف الحساب' : 'إعادة التفعيل'
                  }
                  onPress={() => setSelected(user)}
                />
              )}
          </View>
        )}
      />
      {selected && (
        <Dialog
          title="تغيير حالة الحساب"
          onClose={() => setSelected(undefined)}
          saveLabel="تأكيد"
          onSave={async () => {
            await api(`/admin/users/${selected.id}`, 'PATCH', {
              status: selected.status === 'active' ? 'suspended' : 'active',
            });
            setRevision(n => n + 1);
          }}
        >
          <Text style={ui.note}>{selected.email}</Text>
          <Text style={ui.note}>
            الإيقاف يلغي جلسات الدخول الحالية دون حذف بيانات الطالب. إعادة
            التفعيل تتطلب تسجيل دخول جديد.
          </Text>
        </Dialog>
      )}
    </>
  );
}
export function Payments() {
  const [q, setQ] = useState('');
  return (
    <>
      <Text style={ui.note}>
        سجل للعرض فقط. الدفع الوهمي يتم من شاشة الدفع الخاصة بالطالب، ولا يوجد
        تحصيل أموال حقيقية.
      </Text>
      <Field label="البحث في العمليات" value={q} onChange={setQ} />
      <Pager<Payment>
        path={`/admin/demo-payments?q=${encodeURIComponent(q)}`}
        render={p => (
          <View key={p.id} style={ui.card}>
            <Text style={ui.subtitle}>
              {p.userName} · {p.planName}
            </Text>
            <Text style={ui.note}>{p.userEmail}</Text>
            <Text style={ui.subtitle}>{money(p.amountMinor, p.currency)}</Text>
            <Text style={ui.note}>
              {p.status} · {date(p.createdAt)}
            </Text>
            <Text style={ui.note}>
              نهاية الوصول: {date(p.periodEnd)} ·{' '}
              {p.accessActive ? 'فعال' : 'غير فعال'}
            </Text>
          </View>
        )}
      />
    </>
  );
}
export function Plans() {
  const result = useData<Plan[]>('/admin/plans'),
    directory = useData<Directory>('/admin/directory');
  const [edit, setEdit] = useState<Plan>();
  return (
    <>
      <Text style={ui.note}>
        الأسعار وهمية. تغيير السعر يؤثر على العمليات الجديدة فقط. مزايا وتغطية
        الاشتراك الفعال محمية من التعديل.
      </Text>
      <Data result={result}>
        {plans =>
          plans.map(p => (
            <View key={p.id} style={ui.card}>
              <Text style={ui.subtitle}>
                {p.name} · {money(p.amountMinor, p.currency)}
              </Text>
              <Text style={ui.note}>
                {p.active ? 'متاحة' : 'متوقفة'} · {p.courseIds.length} دورات ·{' '}
                {p.durationDays} يومًا
              </Text>
              {p.features.map((feature, i) => (
                <Text key={i} style={ui.note}>
                  • {feature}
                </Text>
              ))}
              <Button
                title="تعديل الخطة"
                disabled={!directory.data}
                onPress={() => setEdit(p)}
              />
            </View>
          ))
        }
      </Data>
      <ErrorBox message={directory.error} retry={directory.reload} />
      {edit && directory.data && (
        <PlanForm
          plan={edit}
          directory={directory.data}
          close={() => setEdit(undefined)}
          saved={result.reload}
        />
      )}
    </>
  );
}
function PlanForm({
  plan,
  directory,
  close,
  saved,
}: {
  plan: Plan;
  directory: Directory;
  close: () => void;
  saved: () => void;
}) {
  const [value, setValue] = useState(plan),
    [amount, setAmount] = useState((plan.amountMinor / 100).toFixed(2)),
    [features, setFeatures] = useState(plan.features.join('\n'));
  return (
    <Dialog
      title={`تعديل ${plan.name}`}
      onClose={close}
      onSave={async () => {
        if (
          !value.name.trim() ||
          !/^\d+(\.\d{1,2})?$/.test(amount) ||
          Number(amount) > 100000
        ) {
          throw new Error(
            'أدخل اسم الخطة وسعرًا من 0 إلى 100000 بمنزلتين عشريتين كحد أقصى.',
          );
        }
        await api(`/admin/plans/${plan.id}`, 'PUT', {
          code: plan.code,
          name: value.name,
          features: features
            .split('\n')
            .map(v => v.trim())
            .filter(Boolean),
          active: value.active,
          certificateEnabled: value.certificateEnabled,
          courseIds: value.courseIds,
          amountMinor: Math.round(Number(amount) * 100),
        });
        saved();
      }}
    >
      <Field
        label="اسم الخطة"
        value={value.name}
        onChange={name => setValue({ ...value, name })}
        max={100}
      />
      <Field
        label="السعر الوهمي USD"
        value={amount}
        onChange={setAmount}
        numeric
      />
      <Field
        label="المزايا (كل ميزة بسطر)"
        value={features}
        onChange={setFeatures}
        multiline
        max={6000}
      />
      <Toggle
        label="الخطة متاحة"
        value={value.active}
        onChange={active => setValue({ ...value, active })}
      />
      <Toggle
        label="الشهادات"
        value={value.certificateEnabled}
        onChange={certificateEnabled =>
          setValue({ ...value, certificateEnabled })
        }
      />
      <Text style={ui.subtitle}>الدورات المشمولة</Text>
      {directory.courses.map(c => (
        <Toggle
          key={c.id}
          label={c.title}
          value={value.courseIds.includes(c.id)}
          onChange={checked =>
            setValue({
              ...value,
              courseIds: checked
                ? [...value.courseIds, c.id]
                : value.courseIds.filter(id => id !== c.id),
            })
          }
        />
      ))}
    </Dialog>
  );
}
export function Catalog() {
  const result = useData<Directory>('/admin/directory');
  const [category, setCategory] = useState<Category | 'new'>(),
    [instructor, setInstructor] = useState<Instructor | 'new'>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false);
  return (
    <Data result={result}>
      {dir => (
        <>
          <Text style={ui.subtitle}>التصنيفات</Text>
          <Button title="إضافة تصنيف" onPress={() => setCategory('new')} />
          {dir.categories.map(c => (
            <View key={c.id} style={ui.card}>
              <Text style={ui.subtitle}>{c.name}</Text>
              <Text style={ui.note}>{c.active ? 'فعال' : 'غير فعال'}</Text>
              <Button
                secondary
                title="تعديل التصنيف"
                onPress={() => setCategory(c)}
              />
            </View>
          ))}
          <Text style={ui.subtitle}>المدرّسون</Text>
          <Button title="إضافة مدرّس" onPress={() => setInstructor('new')} />
          {dir.instructors.map(i => (
            <View key={i.id} style={ui.card}>
              <Text style={ui.subtitle}>{i.name}</Text>
              <Text style={ui.note}>{i.bio}</Text>
              <Button
                secondary
                title="تعديل المدرّس"
                onPress={() => setInstructor(i)}
              />
            </View>
          ))}
          <Text style={ui.subtitle}>مكتبة الملفات</Text>
          <Text style={ui.note}>
            PNG / JPEG / WebP حتى 5MB · MP4 حتى 100MB. الفيديو يحتاج معالجة قبل
            إضافته للدورة.
          </Text>
          <Button
            title={busy ? 'جاري الرفع…' : 'رفع صورة أو فيديو من الهاتف'}
            disabled={busy}
            onPress={async () => {
              if (pending.current) {
                return;
              }
              pending.current = true;
              setBusy(true);
              setError('');
              try {
                if (await uploadMedia()) {
                  result.reload();
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          />
          <ErrorBox message={error} />
          <Button
            secondary
            title="تحديث حالات الملفات"
            disabled={busy}
            onPress={result.reload}
          />
          {dir.assets.map(a => (
            <View key={a.id} style={ui.card}>
              <Text style={ui.note}>
                {a.id.slice(0, 8)} · {a.mimeType}
              </Text>
              <Text style={ui.subtitle}>{a.status}</Text>
              <Text style={ui.note}>{date(a.createdAt)}</Text>
            </View>
          ))}
          {category && (
            <CategoryForm
              value={category}
              close={() => setCategory(undefined)}
              saved={result.reload}
            />
          )}
          {instructor && (
            <InstructorForm
              value={instructor}
              close={() => setInstructor(undefined)}
              saved={result.reload}
            />
          )}
        </>
      )}
    </Data>
  );
}
function CategoryForm({
  value,
  close,
  saved,
}: {
  value: Category | 'new';
  close: () => void;
  saved: () => void;
}) {
  const [name, setName] = useState(value === 'new' ? '' : value.name),
    [slug, setSlug] = useState(''),
    [active, setActive] = useState(value === 'new' || value.active);
  return (
    <Dialog
      title="التصنيف"
      onClose={close}
      onSave={async () => {
        if (
          !name.trim() ||
          (value === 'new' && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
        ) {
          throw new Error('أدخل الاسم والرابط الصحيح.');
        }
        await api(
          value === 'new'
            ? '/admin/categories'
            : `/admin/categories/${value.id}`,
          value === 'new' ? 'POST' : 'PATCH',
          value === 'new' ? { name, slug } : { name, active },
        );
        saved();
      }}
    >
      <Field label="اسم التصنيف" value={name} onChange={setName} max={100} />
      {value === 'new' ? (
        <Field label="الرابط (english-slug)" value={slug} onChange={setSlug} />
      ) : (
        <Toggle label="فعال" value={active} onChange={setActive} />
      )}
    </Dialog>
  );
}
function InstructorForm({
  value,
  close,
  saved,
}: {
  value: Instructor | 'new';
  close: () => void;
  saved: () => void;
}) {
  const [name, setName] = useState(value === 'new' ? '' : value.name),
    [bio, setBio] = useState(value === 'new' ? '' : value.bio);
  return (
    <Dialog
      title="المدرّس"
      onClose={close}
      onSave={async () => {
        if (!name.trim()) {
          throw new Error('أدخل اسم المدرّس.');
        }
        await api(
          value === 'new'
            ? '/admin/instructors'
            : `/admin/instructors/${value.id}`,
          value === 'new' ? 'POST' : 'PATCH',
          { name, bio },
        );
        saved();
      }}
    >
      <Field label="اسم المدرّس" value={name} onChange={setName} max={100} />
      <Field label="نبذة" value={bio} onChange={setBio} multiline max={2000} />
    </Dialog>
  );
}
export function Activity() {
  return (
    <Pager<Audit>
      path="/admin/audit"
      render={a => (
        <View key={a.id} style={ui.card}>
          <Text style={ui.subtitle}>{a.action}</Text>
          <Text style={ui.note}>
            {a.actorName} · {a.resourceType}
          </Text>
          <Text selectable style={ui.note}>
            {a.resourceId || '—'}
          </Text>
          <Text style={ui.note}>{date(a.createdAt)}</Text>
        </View>
      )}
    />
  );
}
