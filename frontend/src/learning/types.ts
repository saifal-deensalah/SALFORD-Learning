export type Course = {
  id: string;
  title: string;
  slug: string;
  coverUrl: string | null;
  description?: string;
  instructor: { id: string; name: string; bio: string };
  category: { id: string; name: string };
  accessType: 'free' | 'subscription';
  lessonCount: number;
  durationSeconds: number;
  saved: boolean;
  canAccess: boolean;
};
export type Enrollment = {
  id: string;
  courseId: string;
  courseVersionId: string;
  progressPercent: number;
  completedAt: string | null;
  canAccess: boolean;
};
export type LibraryItem = {
  course: Course;
  enrollment: Enrollment;
  nextLessonId: string | null;
};
export type Lesson = {
  id: string;
  title: string;
  durationSeconds: number;
  required: boolean;
  isPreview: boolean;
};
export type Curriculum = {
  courseId: string;
  versionId: string;
  chapters: { id: string; title: string; lessons: Lesson[] }[];
};
export type CourseDetail = {
  course: Course;
  description: string;
  publishedVersionId: string;
  allowedPlanIds: string[];
};
export type Certificate = {
  id: string;
  courseTitle: string;
  learnerName: string;
  status: string;
  issuedAt: string | null;
  verificationUrl: string | null;
};
export type Notification = {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  target: {
    type: 'course' | 'certificate' | 'subscription';
    id: string;
  } | null;
};
