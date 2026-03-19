import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphObjectCache, MAX_WALKS, STALE_EPOCH_DELTA } from './graph-object-cache.js';
import type { GraphIssue, GraphTreeNode } from '../types/index.js';

// Mock the hierarchy walker
vi.mock('./graphql-hierarchy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./graphql-hierarchy.js')>();
  return {
    ...actual,
    GraphQLHierarchyWalker: class {
      async walkDown(issueKey: string, _maxDepth: number, _maxItems: number) {
        const tree: GraphTreeNode = {
          issue: makeIssue({ key: issueKey, summary: `Root ${issueKey}`, hasChildIssues: true }),
          children: [
            { issue: makeIssue({ key: `${issueKey}-1`, parentKey: issueKey }), children: [] },
            { issue: makeIssue({ key: `${issueKey}-2`, parentKey: issueKey }), children: [] },
          ],
        };
        return { tree, totalItems: 3, truncated: false };
      }
    },
  };
});

function makeIssue(overrides: Partial<GraphIssue> = {}): GraphIssue {
  return {
    key: 'TEST-1',
    summary: 'Test Issue',
    issueType: 'Story',
    hierarchyLevel: 1,
    status: 'In Progress',
    statusCategory: 'In Progress',
    assignee: null,
    startDate: null,
    dueDate: null,
    storyPoints: null,
    isResolved: false,
    hasChildIssues: false,
    parentKey: null,
    ...overrides,
  };
}

describe('GraphObjectCache', () => {
  let cache: GraphObjectCache;
  const mockClient = {} as any;

  beforeEach(() => {
    cache = new GraphObjectCache();
  });

  describe('epoch tracking', () => {
    it('starts at 0', () => {
      expect(cache.getEpoch()).toBe(0);
    });

    it('increments on tick', () => {
      cache.tick();
      cache.tick();
      expect(cache.getEpoch()).toBe(2);
    });
  });

  describe('getStatus', () => {
    it('returns not_found for unknown key', () => {
      const status = cache.getStatus('NOPE-1');
      expect(status.state).toBe('not_found');
      expect(status.stale).toBe(false);
    });

    it('returns walking immediately after startWalk', () => {
      cache.startWalk('IP-89', mockClient);
      const status = cache.getStatus('IP-89');
      expect(status.state).toBe('walking');
    });

    it('returns complete after walk finishes', async () => {
      const walk = cache.startWalk('IP-89', mockClient);
      await walk.walkPromise;
      const status = cache.getStatus('IP-89');
      expect(status.state).toBe('complete');
      expect(status.itemCount).toBe(3);
    });

    it('returns stale after epoch delta exceeded', async () => {
      const walk = cache.startWalk('IP-89', mockClient);
      await walk.walkPromise;
      for (let i = 0; i <= STALE_EPOCH_DELTA; i++) cache.tick();
      const status = cache.getStatus('IP-89');
      expect(status.state).toBe('stale');
      expect(status.stale).toBe(true);
    });
  });

  describe('get', () => {
    it('returns null for unknown key', () => {
      expect(cache.get('NOPE-1')).toBeNull();
    });

    it('returns the cached walk', async () => {
      const walk = cache.startWalk('IP-89', mockClient);
      await walk.walkPromise;
      const cached = cache.get('IP-89');
      expect(cached).not.toBeNull();
      expect(cached!.rootKey).toBe('IP-89');
      expect(cached!.flatIndex.size).toBe(3);
    });
  });

  describe('patch', () => {
    it('patches a field on a cached issue', async () => {
      const walk = cache.startWalk('IP-89', mockClient);
      await walk.walkPromise;
      const patched = cache.patch('IP-89-1', { dueDate: '2026-06-01', assignee: 'alice' });
      expect(patched).toBe(true);
      const issue = cache.get('IP-89')!.flatIndex.get('IP-89-1');
      expect(issue!.dueDate).toBe('2026-06-01');
      expect(issue!.assignee).toBe('alice');
    });

    it('returns false for unknown issue', () => {
      expect(cache.patch('NOPE-99', { dueDate: '2026-01-01' })).toBe(false);
    });

    it('patch updates the tree node (same object reference)', async () => {
      const walk = cache.startWalk('IP-89', mockClient);
      await walk.walkPromise;
      cache.patch('IP-89-1', { summary: 'Updated' });
      const treeChild = cache.get('IP-89')!.tree.children[0];
      expect(treeChild.issue.summary).toBe('Updated');
    });
  });

  describe('release', () => {
    it('removes a cached walk', async () => {
      const walk = cache.startWalk('IP-89', mockClient);
      await walk.walkPromise;
      expect(cache.release('IP-89')).toBe(true);
      expect(cache.get('IP-89')).toBeNull();
    });

    it('returns false for unknown key', () => {
      expect(cache.release('NOPE-1')).toBe(false);
    });
  });

  describe('eviction', () => {
    it('evicts oldest walk when at MAX_WALKS capacity', async () => {
      // Fill to capacity
      for (let i = 0; i < MAX_WALKS; i++) {
        const walk = cache.startWalk(`PROJ-${i}`, mockClient);
        await walk.walkPromise;
        cache.tick();
      }
      expect(cache.walks.size).toBe(MAX_WALKS);

      // Add one more — should evict PROJ-0 (oldest epoch)
      const walk = cache.startWalk('PROJ-NEW', mockClient);
      await walk.walkPromise;
      expect(cache.walks.size).toBe(MAX_WALKS);
      expect(cache.get('PROJ-0')).toBeNull();
      expect(cache.get('PROJ-NEW')).not.toBeNull();
    });

    it('reuses existing slot for same root key', async () => {
      for (let i = 0; i < MAX_WALKS; i++) {
        const walk = cache.startWalk(`PROJ-${i}`, mockClient);
        await walk.walkPromise;
      }
      // Re-walk an existing key — should not evict
      const walk = cache.startWalk('PROJ-0', mockClient);
      await walk.walkPromise;
      expect(cache.walks.size).toBe(MAX_WALKS);
      // All original keys should still exist
      for (let i = 0; i < MAX_WALKS; i++) {
        expect(cache.get(`PROJ-${i}`)).not.toBeNull();
      }
    });
  });

  describe('hasStaleWalks', () => {
    it('returns false when no walks', () => {
      expect(cache.hasStaleWalks()).toBe(false);
    });

    it('returns true when a walk is stale', async () => {
      const walk = cache.startWalk('IP-89', mockClient);
      await walk.walkPromise;
      for (let i = 0; i <= STALE_EPOCH_DELTA; i++) cache.tick();
      expect(cache.hasStaleWalks()).toBe(true);
    });
  });
});
