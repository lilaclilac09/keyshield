import { describe, expect, it } from 'vitest';
import { TALK_THREADS } from '../src/web/lib/talk-threads';

describe('talk threads', () => {
  it('has foldable review turns A/B/C plus the ask', () => {
    const review = TALK_THREADS.find((t) => t.id === 'review');
    expect(review?.turns.map((t) => t.id)).toEqual(['want', 'a', 'b', 'c']);
  });

  it('does not claim redb is live', () => {
    const honest = TALK_THREADS.flatMap((t) => t.turns).find((t) => t.id === 'honest');
    expect(honest?.body.join(' ')).toMatch(/Phase 2/);
    expect(honest?.body.join(' ')).not.toMatch(/redb 已上线/);
  });
});
