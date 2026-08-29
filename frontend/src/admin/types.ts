export type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'student';
  status: string;
  emailVerified: boolean;
  createdAt: string;
  enrollmentCount: number;
};
export type Session = { accessToken: string; refreshToken: string; user: User };
export type Page<T> = { items: T[]; nextCursor: string | null };
export type Course = {
  id: string;
  title: string;
  slug: string;
  status: string;
  categoryName: string;
  instructorName: string;
  accessType: string;
  enrollmentCount: number;
  coverUrl: string | null;
};
export type Plan = {
  id: string;
  code: string;
  name: string;
  features: string[];
  active: boolean;
  amountMinor: number;
  currency: string;
  durationDays: number;
  courseIds: string[];
  certificateEnabled: boolean;
};
export type Payment = {
  id: string;
  userName: string;
  userEmail: string;
  planName: string;
  amountMinor: number;
  currency: string;
  status: string;
  createdAt: string;
  periodEnd: string;
  accessActive: boolean;
};
export type Category = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
};
export type Instructor = { id: string; name: string; bio: string };
export type Asset = {
  id: string;
  kind: string;
  status: string;
  mimeType: string;
  createdAt: string;
};
export type Directory = {
  categories: Category[];
  instructors: Instructor[];
  assets: Asset[];
  courses: { id: string; title: string }[];
};
export type Lesson = {
  title: string;
  description: string;
  mediaAssetId: string;
  required: boolean;
  isPreview: boolean;
};
export type Draft = {
  title: string;
  description: string;
  categoryId: string;
  instructorId: string;
  coverAssetId: string | null;
  accessType: 'free' | 'subscription';
  certificateEnabled: boolean;
  featuredRank: number | null;
  chapters: { title: string; lessons: Lesson[] }[];
};
export type CourseDetail = {
  courseId: string;
  versionId: string;
  status: string;
  versionStatus: string;
  draft: Draft;
};
export type Overview = {
  students: number;
  courses: number;
  published: number;
  enrollments: number;
  completions: number;
  activeDemoPayments: number;
  demoAmountMinor: number;
  currency: string;
  activity: { day: string; enrollments: number }[];
  recentCourses: Course[];
};
export type Audit = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorName: string;
  createdAt: string;
};
