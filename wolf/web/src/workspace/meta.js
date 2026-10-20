// Categories, suggested step lines and small helpers shared by the workspace screens.

export const CATEGORIES = {
  research: {
    label: 'Research', plural: 'Research', icon: 'research',
    blurb: 'Papers and studies, from literature review to submission.',
    color: '#34549b',
    // Research always starts with a step line; it can be edited per entry.
    steps: ['Literature review', 'Problem statement', 'Idea generation', 'Methodology', 'Experiments', 'Analysis', 'Paper writing', 'Submission'],
    stepsByDefault: true,
  },
  project: {
    label: 'Project', plural: 'Projects', icon: 'project',
    blurb: 'Things you build, launch or run.',
    color: '#2e6a57',
    steps: ['Planning', 'Design', 'Build', 'Test', 'Launch'],
    stepsByDefault: false,
  },
  academic: {
    label: 'Academic', plural: 'Academic', icon: 'academic',
    blurb: 'Courses, theses, exams and coursework.',
    color: '#8f5a0c',
    steps: ['Syllabus', 'Lectures', 'Assignments', 'Revision', 'Exam'],
    stepsByDefault: false,
  },
};

export const CATEGORY_ORDER = ['research', 'project', 'academic'];

export const STATUS = {
  active: { label: 'Active', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  done: { label: 'Done', tone: 'info' },
  archived: { label: 'Archived', tone: 'muted' },
};

export const PRIORITY = {
  low: { label: 'Low' },
  normal: { label: 'Normal' },
  high: { label: 'High' },
};

export const SWATCHES = ['#2e6a57', '#34549b', '#6b4bb3', '#a93a28', '#8f5a0c', '#b3417f', '#1f7a8c', '#4a5560'];

/** Today in the browser's time zone, as 'YYYY-MM-DD'. */
export const today = () => localDate(new Date());
export const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d, n) => {
  const dt = new Date(`${d}T00:00:00`);
  dt.setDate(dt.getDate() + n);
  return localDate(dt);
};
export const weekdayOf = (d) => new Date(`${d}T00:00:00`).getDay();

// weekday numbers match JavaScript's getDay(): 0 = Sunday.
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Weeks start on Sunday, so a Sun–Thu work week comes first and Fri–Sat sit at the end. 6 = Saturday start.
export const WEEK_START = 0;
export const weekOrder = () => Array.from({ length: 7 }, (_, i) => (WEEK_START + i) % 7);

/** '17:30' -> '5:30 pm' */
export function clock(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}
export const timeRange = (a, b) => (a ? (b ? `${clock(a)} – ${clock(b)}` : clock(a)) : 'Any time');

/** [0, 2, 4] -> 'Sun, Tue, Thu'; every day -> 'Every day'. */
export function dayList(days) {
  if (days.length === 7) return 'Every day';
  const order = weekOrder();
  return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((d) => WEEKDAYS_SHORT[d]).join(', ');
}

export const PAPER_STATUS = {
  to_read: { label: 'To read', tone: 'muted' },
  reading: { label: 'Reading', tone: 'info' },
  read: { label: 'Read', tone: 'ok' },
};

export const EVENT_TYPE = {
  task: { label: 'Task due', icon: 'check' },
  subtask: { label: 'Subtask due', icon: 'subtask' },
  deadline: { label: 'Deadline', icon: 'flag' },
  ct: { label: 'CT', icon: 'academic' },
  routine: { label: 'Routine', icon: 'repeat' },
  class: { label: 'Class', icon: 'clock' },
  lab: { label: 'Lab', icon: 'clock' },
  meeting: { label: 'Meeting', icon: 'users' },
  contest: { label: 'Contest', icon: 'trophy' },
};

/* ---------- Files ---------- */

// Formats the browser can show safely. Everything else (slides, docs, archives, pages...) downloads
// under its own name, so no uploaded file can ever run as a Wolf page. Keep in step with server/attachments.js.
export const VIEWABLE = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain',
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
]);
export const canView = (f) => VIEWABLE.has(f.mime);
export const tooBig = (f, limitMb) => f.size > limitMb * 1048576;

const KINDS = [
  [/pdf$/i, 'PDF'],
  [/\.(pptx?|key|odp)$/i, 'Slides'],
  [/\.(docx?|odt|rtf)$/i, 'Doc'],
  [/\.(xlsx?|csv|ods)$/i, 'Sheet'],
  [/\.(png|jpe?g|webp|gif)$/i, 'Image'],
  [/\.(zip|rar|7z)$/i, 'Archive'],
];
/** 'Lecture 3.pptx' -> 'Slides' */
export const fileKind = (f) => KINDS.find(([re]) => re.test(f.name) || re.test(f.mime))?.[1] || 'File';

/**
 * Link to open a file: this device's copy if it has one, else the synced copy on the server, else null.
 * For PDFs, a reference with a number ("Slide 4", "p. 12") opens at that page.
 */
export function fileUrl(f, ref) {
  const base = f.localUrl || (f.synced ? `/api/w/files/${f.id}` : null);
  if (!base) return null;
  const page = f.mime === 'application/pdf' && /\d+/.exec(ref || '')?.[0];
  return `${base}${page ? `#page=${page}` : ''}`;
}

/** Props for a link to a file: view it in a new tab, or download it under its real name. */
export function fileLink(f, ref) {
  const href = fileUrl(f, ref);
  if (!href) return null;
  if (canView(f)) return { href, target: '_blank', rel: 'noreferrer' };
  return { href: f.localUrl || `/api/w/files/${f.id}?download`, download: f.name };
}

/** Where a file lives, from this device's point of view. */
export const fileWhere = (f) => (f.synced ? 'synced' : f.localUrl ? 'local' : 'elsewhere');

/** 'YYYY-MM-DD' -> '12 Oct' (or '12 Oct 2027' outside this year). */
export function shortDate(d) {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export const isOverdue = (d) => Boolean(d) && d < today();
export const isToday = (d) => d === today();

/** Current position on the step line: { current, done, total, label }. */
export function stepState(e) {
  const total = e.steps.length;
  const done = Math.min(e.stepIndex, total);
  const current = e.steps[done] || null;
  return { current, done, total, finished: total > 0 && done >= total };
}
