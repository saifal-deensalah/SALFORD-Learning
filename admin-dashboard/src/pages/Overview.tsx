import { Badge, DataState, date, Empty, money, useData } from '../ui';
import type { Overview as OverviewData } from '../types';
export function Overview({ onCourses }: { onCourses: () => void }) {
  const result = useData<OverviewData>('/admin/overview');
  const d = result.data;
  return (
    <DataState {...result} retry={result.reload}>
      {d && (
        <>
          <section className="welcome">
            <div>
              <span className="eyebrow">LEARNING, IN FOCUS</span>
              <h2>كل ما يحتاجه التعليم، في مكان واحد.</h2>
              <p>تابع الطلاب، ونظّم محتوى SALFORD من لوحة الإدارة.</p>
              <button onClick={onCourses}>
                إدارة الدورات <span>←</span>
              </button>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <div className="book">
                <span>S</span>
                <small>
                  LEARN
                  <br />
                  CREATE
                  <br />
                  GROW
                </small>
              </div>
              <span className="orbit one" />
              <span className="orbit two" />
            </div>
          </section>
          <section className="stats">
            {[
              ['الطلاب المسجلون', d.students, 'حسابات الطلاب', '01'],
              [
                'الدورات المنشورة',
                d.published,
                `من أصل ${d.courses} دورات`,
                '02',
              ],
              [
                'التسجيلات بالدورات',
                d.enrollments,
                `${d.completions} دورة مكتملة`,
                '03',
              ],
              [
                'اشتراكات تجريبية',
                d.activeDemoPayments,
                'بدون تحصيل أموال',
                '04',
              ],
            ].map(([name, value, note, n]) => (
              <article className="stat" key={name}>
                <div>
                  <span>{name}</span>
                  <i>{n}</i>
                </div>
                <strong>{value}</strong>
                <small>{note}</small>
              </article>
            ))}
          </section>
          <section className="overview-grid">
            <article className="panel">
              <div className="section-title">
                <div>
                  <h2>نشاط التعلّم</h2>
                  <p>التسجيلات الجديدة خلال آخر 7 أيام</p>
                </div>
                <span className="badge active">مباشر من السيرفر</span>
              </div>
              <div
                className="chart"
                role="img"
                aria-label={`التسجيلات اليومية: ${d.activity
                  .map((a) => `${a.day}: ${a.enrollments}`)
                  .join('، ')}`}
              >
                {d.activity.map((a) => (
                  <div className="chart-column" key={a.day}>
                    <strong>{a.enrollments}</strong>
                    <div className="bar-track">
                      <div
                        style={{
                          height: `${Math.max(
                            2,
                            (a.enrollments /
                              Math.max(
                                1,
                                ...d.activity.map((v) => v.enrollments)
                              )) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <small>
                      {new Date(a.day).toLocaleDateString('ar-JO', {
                        weekday: 'short',
                      })}
                    </small>
                  </div>
                ))}
              </div>
            </article>
            <article className="demo-card">
              <span className="eyebrow">DEMO MODE</span>
              <h2>الدفع للتجربة فقط</h2>
              <p>
                لا يوجد أي تحصيل مالي. الدفع يتم من شاشة واحدة داخل تطبيق
                الموبايل.
              </p>
              <span>إجمالي المبالغ المحاكاة</span>
              <strong dir="ltr">{money(d.demoAmountMinor)}</strong>
              <small>هذه ليست إيرادات حقيقية.</small>
            </article>
          </section>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>دوراتك الأخيرة</h2>
                <p>محتوى يستحق المتابعة</p>
              </div>
              <button onClick={onCourses}>عرض كل الدورات ←</button>
            </div>
            {d.recentCourses.length ? (
              <div className="course-grid">
                {d.recentCourses.slice(0, 3).map((c) => (
                  <article className="course-card" key={c.id}>
                    <div className="course-cover">
                      {c.coverUrl ? (
                        <img src={c.coverUrl} alt="" />
                      ) : (
                        <span>Salford.</span>
                      )}
                      <Badge value={c.status} />
                    </div>
                    <div className="course-info">
                      <small>{c.categoryName}</small>
                      <h3>{c.title}</h3>
                      <p>{c.instructorName}</p>
                      <footer>
                        <span>{c.enrollmentCount} طالب</span>
                        <Badge value={c.accessType} />
                      </footer>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty />
            )}
          </section>
          <p className="footnote">
            آخر عرض للبيانات: {date(new Date().toISOString())}
          </p>
        </>
      )}
    </DataState>
  );
}
