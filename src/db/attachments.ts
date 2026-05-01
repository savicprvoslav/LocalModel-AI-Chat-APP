import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type AttachmentKind = 'image';
export type AttachmentSource = 'camera' | 'library';

export type MessageAttachment = {
  id: string;
  message_id: string;
  kind: AttachmentKind;
  /** file:// URI under documentDirectory/attachments/<message_id>/. */
  uri: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  source: AttachmentSource;
  /** Optional model-generated description. Populated lazily by vision-capable engines. */
  caption: string | null;
  created_at: number;
};

export const insertAttachment = async (args: {
  message_id: string;
  kind: AttachmentKind;
  uri: string;
  mime_type: string;
  width?: number | null;
  height?: number | null;
  size_bytes?: number | null;
  source: AttachmentSource;
  caption?: string | null;
}): Promise<MessageAttachment> => {
  const row: MessageAttachment = {
    id: randomUUID(),
    message_id: args.message_id,
    kind: args.kind,
    uri: args.uri,
    mime_type: args.mime_type,
    width: args.width ?? null,
    height: args.height ?? null,
    size_bytes: args.size_bytes ?? null,
    source: args.source,
    caption: args.caption ?? null,
    created_at: Date.now()
  };
  await getDb().runAsync(
    'INSERT INTO message_attachments(id,message_id,kind,uri,mime_type,width,height,size_bytes,source,caption,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    row.id,
    row.message_id,
    row.kind,
    row.uri,
    row.mime_type,
    row.width,
    row.height,
    row.size_bytes,
    row.source,
    row.caption,
    row.created_at
  );
  return row;
};

export const listAttachments = async (
  messageId: string
): Promise<MessageAttachment[]> =>
  getDb().getAllAsync<MessageAttachment>(
    'SELECT * FROM message_attachments WHERE message_id = ? ORDER BY created_at ASC',
    messageId
  );

export const listAttachmentsForConversation = async (
  conversationId: string
): Promise<MessageAttachment[]> =>
  getDb().getAllAsync<MessageAttachment>(
    `SELECT a.* FROM message_attachments a
     INNER JOIN messages m ON m.id = a.message_id
     WHERE m.conversation_id = ?
     ORDER BY a.created_at ASC`,
    conversationId
  );

export const updateAttachmentCaption = async (
  id: string,
  caption: string
): Promise<void> => {
  await getDb().runAsync(
    'UPDATE message_attachments SET caption = ? WHERE id = ?',
    caption,
    id
  );
};

export const deleteAttachment = async (id: string): Promise<void> => {
  await getDb().runAsync('DELETE FROM message_attachments WHERE id = ?', id);
};
