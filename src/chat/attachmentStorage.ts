/**
 * On-disk layout for message attachment files.
 *
 * <documentDirectory>/attachments/
 *   <message_id>/
 *     <attachment_id>.<ext>
 *
 * Files are persisted forever (cascade-deleted via SQLite trigger when the
 * message itself is deleted; see `cleanupAttachmentsForMessage` for the
 * file-system half of that cleanup).
 */
import * as FS from 'expo-file-system/legacy';

const ROOT = (): string => `${FS.documentDirectory}attachments/`;

export const attachmentsRoot = (): string => ROOT();

export const messageAttachmentsDir = (messageId: string): string =>
  `${ROOT()}${messageId}/`;

export const ensureAttachmentsDir = async (messageId: string): Promise<string> => {
  const dir = messageAttachmentsDir(messageId);
  await FS.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
};

const extFromMime = (mime: string): string => {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
};

/**
 * Copy a picker-returned file into the app's persistent attachments folder.
 * Returns the new file:// URI we'll store in the DB.
 *
 * `srcUri` is what expo-image-picker hands us — it may be a file:// in a
 * picker cache, an asset:// URL, or a ph:// PHAsset. The legacy FS module's
 * copyAsync handles file:// reliably; for non-file URIs we fall back to
 * downloadAsync which accepts more schemes.
 */
export const copyToAttachments = async (args: {
  messageId: string;
  attachmentId: string;
  srcUri: string;
  mime: string;
}): Promise<{ uri: string; sizeBytes: number | null }> => {
  await ensureAttachmentsDir(args.messageId);
  const dest = `${messageAttachmentsDir(args.messageId)}${args.attachmentId}.${extFromMime(args.mime)}`;
  if (args.srcUri.startsWith('file://')) {
    await FS.copyAsync({ from: args.srcUri, to: dest });
  } else {
    const r = await FS.downloadAsync(args.srcUri, dest);
    if (!r.uri) throw new Error('failed to copy attachment');
  }
  const info = await FS.getInfoAsync(dest);
  const size = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : null;
  return { uri: dest, sizeBytes: size };
};

/**
 * Best-effort cleanup of the on-disk folder for a message. The DB rows are
 * already cascade-deleted via the FK; this just frees the bytes.
 */
export const cleanupAttachmentsForMessage = async (
  messageId: string
): Promise<void> => {
  const dir = messageAttachmentsDir(messageId);
  await FS.deleteAsync(dir, { idempotent: true });
};
