// Shrinks a picked image in the browser so thumbnails stay small in the database.
const MAX_W = 1280;
const MAX_H = 720;

export async function resizeImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That image could not be read. Try a JPEG, PNG or WebP.');
  });
  const scale = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  // Safari may not encode WebP and falls back to PNG; JPEG keeps that small.
  if (blob?.type === 'image/webp') return blob;
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}
