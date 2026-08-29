export interface Course {
  id: string;
  title: string;
  author: string;
  category: string;
  image: string;
}
export const courses: Course[] = [
  {
    id: 'programming',
    title: 'Introduction to Programming',
    author: 'John Smith',
    category: 'Programming',
    image: '0fc7964757c8ea8dc519cf62dfbce8a52dc3f50e',
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity Essentials',
    author: 'Emily Davis',
    category: 'Cybersecurity',
    image: '0fc7964757c8ea8dc519cf62dfbce8a52dc3f50e',
  },
  {
    id: 'visual-design',
    title: 'Visual Design',
    author: 'Luis John',
    category: 'Graphic Design',
    image: 'e4fbad794b16f31dc4a2ecded5516af6f381d4c6',
  },
  {
    id: 'ux-research',
    title: 'UX research',
    author: 'Aina Asif',
    category: 'UI & UX',
    image: 'e4fbad794b16f31dc4a2ecded5516af6f381d4c6',
  },
  {
    id: 'figma',
    title: 'UI Design Wit Figma',
    author: 'John Smith',
    category: 'UI & UX',
    image: '84ff79a7a82b9b96dc34da5b41730890d2b0da46',
  },
  {
    id: 'portfolio',
    title: 'Build Own Portfolio',
    author: 'John Smith',
    category: 'Graphic Design',
    image: '7f5eacec28e94fb227c0c6db1989631775f45d66',
  },
  {
    id: 'prototyping',
    title: 'Advance Prototyping',
    author: 'John Smith',
    category: 'Animation',
    image: '7f5eacec28e94fb227c0c6db1989631775f45d66',
  },
];

export function searchCourses(query: string, category = 'All') {
  const q = query.trim().toLowerCase();
  return courses.filter(
    c =>
      (category === 'All' || c.category === category) &&
      `${c.title} ${c.author} ${c.category}`.toLowerCase().includes(q),
  );
}
export function validateCredentials(
  email: string,
  password: string,
  confirm?: string,
): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  if (password.length < 8) {
    return 'Use a password with at least 8 characters.';
  }
  if (confirm !== undefined && password !== confirm) {
    return 'Passwords do not match.';
  }
  return null;
}
