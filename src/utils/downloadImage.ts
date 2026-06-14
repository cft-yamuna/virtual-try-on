const FALLBACK_FILE_NAME = 'virtual-try-on-result.png';

export const buildResultDownloadFileName = (userName: string) => {
  const slug = userName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug ? `virtual-try-on-${slug}.png` : FALLBACK_FILE_NAME;
};

export const downloadImageFile = (
  imageSrc: string,
  fileName: string,
  ownerDocument: Document = document
) => {
  if (!imageSrc) return false;

  const link = ownerDocument.createElement('a');
  link.href = imageSrc;
  link.download = fileName || FALLBACK_FILE_NAME;
  link.rel = 'noopener';

  ownerDocument.body.appendChild(link);
  link.click();
  link.remove();

  return true;
};
