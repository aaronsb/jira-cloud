/**
 * Server-side cache for hierarchy walk results.
 * Walk once, analyze many — avoids redundant GraphQL traversals.
 */
import type { GraphQLClient } from './graphql-client.js';
import { GraphQLHierarchyWalker, walkTree } from './graphql-hierarchy.js';
import type { CachedWalk, CacheStatus, GraphIssue, GraphTreeNode } from '../types/index.js';

export const MAX_ITEMS = 10_000;
export const MAX_WALKS = 5;
export const STALE_EPOCH_DELTA = 100;

export class GraphObjectCache {
  readonly walks = new Map<string, CachedWalk>();
  private epoch = 0;

  /** Increment epoch — call on every tool invocation. */
  tick(): void {
    this.epoch++;
  }

  getEpoch(): number {
    return this.epoch;
  }

  /** Start a background hierarchy walk for the given root issue key. */
  startWalk(rootKey: string, graphqlClient: GraphQLClient): CachedWalk {
    // Evict if at capacity — remove oldest by createdEpoch
    if (this.walks.size >= MAX_WALKS && !this.walks.has(rootKey)) {
      let oldestKey: string | null = null;
      let oldestEpoch = Infinity;
      for (const [key, walk] of this.walks) {
        if (walk.createdEpoch < oldestEpoch) {
          oldestEpoch = walk.createdEpoch;
          oldestKey = key;
        }
      }
      if (oldestKey) this.walks.delete(oldestKey);
    }

    const tree: GraphTreeNode = {
      issue: {
        key: rootKey,
        summary: '',
        issueType: 'Unknown',
        hierarchyLevel: null,
        status: 'Unknown',
        statusCategory: 'unknown',
        assignee: null,
        startDate: null,
        dueDate: null,
        storyPoints: null,
        isResolved: false,
        hasChildIssues: false,
        parentKey: null,
      },
      children: [],
    };

    const flatIndex = new Map<string, GraphIssue>();
    flatIndex.set(rootKey, tree.issue);

    const cached: CachedWalk = {
      rootKey,
      tree,
      flatIndex,
      state: 'walking',
      itemCount: 0,
      createdEpoch: this.epoch,
    };

    // Start async walk with progress reporting
    const walker = new GraphQLHierarchyWalker(graphqlClient);
    cached.walkPromise = walker.walkDown(rootKey, 8, MAX_ITEMS, (count) => {
      cached.itemCount = count;
    }).then(({ tree: walked, totalItems }) => {
      cached.tree = walked;
      cached.itemCount = totalItems;
      cached.state = 'complete';
      // Rebuild flat index from walked tree
      cached.flatIndex.clear();
      walkTree(walked, (node) => {
        cached.flatIndex.set(node.issue.key, node.issue);
      });
    }).catch((err) => {
      console.error(`[graph-cache] Walk failed for ${rootKey}:`, err);
      // Leave in walking state with error info — caller can retry
      cached.state = 'complete';
      cached.itemCount = 0;
    });

    this.walks.set(rootKey, cached);
    return cached;
  }

  /** Get the status of a cached walk. */
  getStatus(rootKey: string): CacheStatus {
    const walk = this.walks.get(rootKey);
    if (!walk) {
      return { state: 'not_found', itemCount: 0, stale: false };
    }
    const stale = walk.state === 'complete' && (this.epoch - walk.createdEpoch) > STALE_EPOCH_DELTA;
    return {
      state: stale ? 'stale' : walk.state,
      itemCount: walk.itemCount,
      stale,
    };
  }

  /** Get a cached walk by root key. Returns null if not found. */
  get(rootKey: string): CachedWalk | null {
    return this.walks.get(rootKey) ?? null;
  }

  /**
   * Patch a specific issue's fields in any cached walk.
   * Uses the flat index for O(1) lookup. Returns true if the issue was found and patched.
   */
  patch(issueKey: string, fields: Partial<GraphIssue>): boolean {
    for (const walk of this.walks.values()) {
      const issue = walk.flatIndex.get(issueKey);
      if (issue) {
        Object.assign(issue, fields);
        return true;
      }
    }
    return false;
  }

  /** Release a cached walk, freeing memory. */
  release(rootKey: string): boolean {
    return this.walks.delete(rootKey);
  }

  /** Check if any walk is stale given the current epoch. */
  hasStaleWalks(): boolean {
    for (const walk of this.walks.values()) {
      if (walk.state === 'complete' && (this.epoch - walk.createdEpoch) > STALE_EPOCH_DELTA) {
        return true;
      }
    }
    return false;
  }
}
