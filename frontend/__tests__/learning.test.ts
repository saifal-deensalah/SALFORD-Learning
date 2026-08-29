import {
  searchCourses,
  validateCredentials,
} from '../src/data/courses';
import { initialState, readLearningState } from '../src/state/useLearningState';

describe('local learning model', () => {
  test('search matches names, categories and instructors and combines filters', () => {
    expect(searchCourses('  john  ').length).toBeGreaterThan(0);
    expect(searchCourses('figma', 'UI & UX').map(c => c.id)).toEqual(['figma']);
    expect(searchCourses('figma', 'Programming')).toEqual([]);
    expect(searchCourses('no-such-course')).toEqual([]);
  });
  test('credential validation rejects malformed inputs and mismatched confirmation', () => {
    expect(validateCredentials('bad', 'password123')).toMatch(/email/);
    expect(validateCredentials('test@example.com', 'short')).toMatch(/8/);
    expect(
      validateCredentials('test@example.com', 'password123', 'different'),
    ).toMatch(/match/);
    expect(
      validateCredentials('test@example.com', 'password123', 'password123'),
    ).toBeNull();
  });
  test('stored preferences tolerate corruption and never restore secrets', () => {
    expect(readLearningState('bad-json')).toEqual(initialState);
    expect(readLearningState('null')).toEqual(initialState);
    const state = readLearningState(
      JSON.stringify({
        bookmarks: ['figma', 42],
        progress: { figma: 190, bad: '12' },
        password: 'secret',
        cvv: '123',
        plan: 'Enterprise',
      }),
    );
    expect(state.bookmarks).toEqual(['figma']);
    expect(state.progress).toEqual({ figma: 100 });
    expect(state.plan).toBeNull();
    expect(state).not.toHaveProperty('password');
    expect(state).not.toHaveProperty('cvv');
  });
});
