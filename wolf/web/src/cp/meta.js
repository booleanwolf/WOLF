// Competitive programming: platforms, statuses, tags and small helpers.

export const PLATFORMS = {
  codeforces: { label: 'Codeforces', short: 'CF' },
  atcoder: { label: 'AtCoder', short: 'AC' },
  leetcode: { label: 'LeetCode', short: 'LC' },
  codechef: { label: 'CodeChef', short: 'CC' },
  cses: { label: 'CSES', short: 'CSES' },
  other: { label: 'Other', short: 'Other' },
};

export const PROBLEM_STATUS = {
  solved: { label: 'Solved', tone: 'ok', icon: 'check' },
  upsolve: { label: 'Upsolve', tone: 'warn', icon: 'repeat' },
  attempted: { label: 'Attempted', tone: 'danger', icon: 'x' },
  todo: { label: 'To do', tone: 'muted', icon: 'flag' },
};

export const TOPIC_STATUS = {
  learning: { label: 'Learning', tone: 'info' },
  todo: { label: 'To learn', tone: 'muted' },
  done: { label: 'Comfortable', tone: 'ok' },
};

// Codeforces tag names, so manual entries use the same words as imported ones.
export const COMMON_TAGS = [
  'implementation', 'math', 'greedy', 'dp', 'data structures', 'brute force', 'constructive algorithms', 'graphs',
  'sortings', 'binary search', 'dfs and similar', 'trees', 'strings', 'number theory', 'combinatorics', 'two pointers',
  'bitmasks', 'geometry', 'dsu', 'shortest paths', 'probabilities', 'divide and conquer', 'hashing', 'games',
  'interactive', 'matrices', 'string suffix structures', 'graph matchings', 'flows', 'fft', 'ternary search', 'meet-in-the-middle',
];

/** A starter roadmap for the Learning tab, roughly in the order people learn it. tag links practice counts. */
export const STARTER_TOPICS = [
  ['Complexity and STL', 'implementation', 'https://usaco.guide/bronze/time-comp'],
  ['Sorting and greedy', 'greedy', 'https://usaco.guide/bronze/intro-greedy'],
  ['Prefix sums', '', 'https://usaco.guide/silver/prefix-sums'],
  ['Two pointers', 'two pointers', 'https://usaco.guide/silver/two-pointers'],
  ['Binary search', 'binary search', 'https://cp-algorithms.com/num_methods/binary_search.html'],
  ['Bit manipulation', 'bitmasks', 'https://cp-algorithms.com/algebra/bit-manipulation.html'],
  ['Number theory: primes, GCD, modular arithmetic', 'number theory', 'https://cp-algorithms.com/algebra/sieve-of-eratosthenes.html'],
  ['Combinatorics', 'combinatorics', 'https://cp-algorithms.com/combinatorics/binomial-coefficients.html'],
  ['DP basics', 'dp', 'https://usaco.guide/gold/intro-dp'],
  ['Knapsack and LIS', 'dp', 'https://cp-algorithms.com/sequences/longest_increasing_subsequence.html'],
  ['Graphs: BFS and DFS', 'dfs and similar', 'https://cp-algorithms.com/graph/breadth-first-search.html'],
  ['Shortest paths (Dijkstra, Bellman-Ford)', 'shortest paths', 'https://cp-algorithms.com/graph/dijkstra.html'],
  ['DSU', 'dsu', 'https://cp-algorithms.com/data_structures/disjoint_set_union.html'],
  ['Minimum spanning tree', 'graphs', 'https://cp-algorithms.com/graph/mst_kruskal.html'],
  ['Trees: DFS order, LCA', 'trees', 'https://cp-algorithms.com/graph/lca_binary_lifting.html'],
  ['Segment tree', 'data structures', 'https://cp-algorithms.com/data_structures/segment_tree.html'],
  ['Fenwick tree', 'data structures', 'https://cp-algorithms.com/data_structures/fenwick.html'],
  ['String hashing', 'hashing', 'https://cp-algorithms.com/string/string-hashing.html'],
  ['KMP and Z-function', 'strings', 'https://cp-algorithms.com/string/prefix-function.html'],
  ['Bitmask DP', 'bitmasks', 'https://usaco.guide/gold/dp-bitmasks'],
  ['Geometry basics', 'geometry', 'https://cp-algorithms.com/geometry/basic-geometry.html'],
];

/** Codeforces ranks, for rating chips and tooltips. dot is the rank colour Codeforces itself uses. */
const RANKS = [
  [1200, 'Newbie', '#808080'], [1400, 'Pupil', '#008000'], [1600, 'Specialist', '#03a89e'], [1900, 'Expert', '#0000ff'],
  [2100, 'Candidate Master', '#aa00aa'], [2300, 'Master', '#ff8c00'], [2400, 'International Master', '#ff8c00'],
  [2600, 'Grandmaster', '#ff0000'], [3000, 'International Grandmaster', '#ff0000'], [Infinity, 'Legendary Grandmaster', '#aa0000'],
];
export const cfRank = (r) => {
  const [, name, dot] = RANKS.find(([max]) => r < max);
  return { name, dot };
};

/**
 * Reads platform, problem code and a title guess from a problem link.
 * codeforces.com/contest/1850/problem/C -> { platform: 'codeforces', code: '1850C' }
 */
export function parseProblemUrl(raw) {
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname;
  let m;
  if (host.endsWith('codeforces.com')) {
    m = /\/(?:contest|gym)\/(\d+)\/problem\/(\w+)/.exec(path) || /\/problemset\/problem\/(\d+)\/(\w+)/.exec(path);
    if (m) return { platform: 'codeforces', code: `${m[1]}${m[2].toUpperCase()}`, title: '' };
  }
  if (host === 'atcoder.jp' && (m = /\/contests\/[\w-]+\/tasks\/([\w-]+)/.exec(path))) {
    return { platform: 'atcoder', code: m[1], title: m[1].replace(/_/g, ' ').toUpperCase() };
  }
  if (host.endsWith('leetcode.com') && (m = /\/problems\/([\w-]+)/.exec(path))) {
    return { platform: 'leetcode', code: m[1], title: titleCase(m[1]) };
  }
  if (host.endsWith('codechef.com') && (m = /\/(?:problems|[\w]+\/problems)\/(\w+)/.exec(path))) {
    return { platform: 'codechef', code: m[1], title: m[1] };
  }
  if (host === 'cses.fi' && (m = /\/problemset\/task\/(\d+)/.exec(path))) {
    return { platform: 'cses', code: m[1], title: '' };
  }
  return { platform: 'other', code: null, title: '' };
}
const titleCase = (slug) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** 125 -> '2h 5m' */
export const minutes = (m) => (m == null ? '' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`);

/** '2026-10-01T14:35:00Z' -> 'in 2d 4h' */
export function countdown(iso) {
  const s = Math.round((new Date(iso) - Date.now()) / 1000);
  if (s <= 0) return 'started';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `in ${d}d ${h}h` : h ? `in ${h}h ${m}m` : `in ${m}m`;
}

/** Minutes east of UTC for this browser, as the server's Codeforces import wants it. */
export const tzOffset = () => -new Date().getTimezoneOffset();
