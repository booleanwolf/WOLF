export const money = (n) => `৳${Number(n || 0).toLocaleString('en-IN')}`;

export const dateTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

export const date = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return date(iso);
}

export const fileSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const slugify = (s, max = 80) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, max);

// In workflow order. Weight-priced orders start at awaiting_quote; everything else starts at pending.
export const ORDER_STATUS = {
  awaiting_quote: { label: 'Needs invoice', tone: 'warn', quoteOnly: true },
  quoted: { label: 'Invoice sent', tone: 'muted', quoteOnly: true },
  pending: { label: 'Payment check', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  printing: { label: 'Printing', tone: 'accent' },
  shipped: { label: 'Shipped', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const PAYMENT_STATUS = {
  unverified: { label: 'Payment unverified', short: 'Unverified', tone: 'warn' },
  verified: { label: 'Payment verified', short: 'Verified', tone: 'ok' },
  rejected: { label: 'Payment rejected', short: 'Rejected', tone: 'danger' },
};

export const METHOD = { bkash: 'bKash', nagad: 'Nagad' };
export const CONTACT = { email: 'Email', whatsapp: 'WhatsApp' };

/** Taka per gram, e.g. 4.5 -> "৳4.5/g". */
export const rate = (n) => `৳${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/g`;

/** Price of one invoice line, matching the server: round(grams × rate + add-ons) per piece, times quantity. */
export const weightAmount = (grams, ratePerGram, extrasPerUnit, qty) =>
  Math.round(Number(grams) * Number(ratePerGram) + (Number(extrasPerUnit) || 0)) * qty;

/** 01712345678 -> https://wa.me/8801712345678 */
export const whatsappUrl = (phone, text) =>
  `https://wa.me/880${String(phone).replace(/\D/g, '').replace(/^(880|0)/, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const AREA = { inside_dhaka: 'Inside Dhaka', outside_dhaka: 'Outside Dhaka' };
