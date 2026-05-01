import { initTestDb, resetDb } from '../db';
import { createConversation } from '../conversations';
import { appendMessage, deleteMessage } from '../messages';
import {
  insertAttachment,
  listAttachments,
  listAttachmentsForConversation,
  updateAttachmentCaption,
  deleteAttachment
} from '../attachments';

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('attachments repo', () => {
  it('inserts and lists by message', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({ conversation_id: c.id, role: 'user', content: 'pic' });
    const att = await insertAttachment({
      message_id: m.id,
      kind: 'image',
      uri: 'file:///docs/attachments/m1/a1.jpg',
      mime_type: 'image/jpeg',
      width: 1280,
      height: 720,
      size_bytes: 234567,
      source: 'camera'
    });
    expect(att.id).toBeTruthy();
    const list = await listAttachments(m.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.uri).toBe('file:///docs/attachments/m1/a1.jpg');
    expect(list[0]?.source).toBe('camera');
  });

  it('returns empty list for messages without attachments', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({ conversation_id: c.id, role: 'user', content: 'no pic' });
    await expect(listAttachments(m.id)).resolves.toEqual([]);
  });

  it('lists all attachments across a conversation', async () => {
    const c = await createConversation({ title: 'T' });
    const m1 = await appendMessage({ conversation_id: c.id, role: 'user', content: 'a' });
    const m2 = await appendMessage({ conversation_id: c.id, role: 'user', content: 'b' });
    await insertAttachment({
      message_id: m1.id,
      kind: 'image',
      uri: 'file:///x/1.jpg',
      mime_type: 'image/jpeg',
      source: 'library'
    });
    await insertAttachment({
      message_id: m2.id,
      kind: 'image',
      uri: 'file:///x/2.jpg',
      mime_type: 'image/jpeg',
      source: 'camera'
    });
    const all = await listAttachmentsForConversation(c.id);
    expect(all).toHaveLength(2);
  });

  it('cascades delete when the message is deleted', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({ conversation_id: c.id, role: 'user', content: 'pic' });
    await insertAttachment({
      message_id: m.id,
      kind: 'image',
      uri: 'file:///x.jpg',
      mime_type: 'image/jpeg',
      source: 'camera'
    });
    await deleteMessage(m.id);
    await expect(listAttachments(m.id)).resolves.toEqual([]);
  });

  it('updates caption', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({ conversation_id: c.id, role: 'user', content: '' });
    const att = await insertAttachment({
      message_id: m.id,
      kind: 'image',
      uri: 'file:///x.jpg',
      mime_type: 'image/jpeg',
      source: 'library'
    });
    await updateAttachmentCaption(att.id, 'a coffee shop menu in Italian');
    const list = await listAttachments(m.id);
    expect(list[0]?.caption).toBe('a coffee shop menu in Italian');
  });

  it('deletes a single attachment by id', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({ conversation_id: c.id, role: 'user', content: '' });
    const att = await insertAttachment({
      message_id: m.id,
      kind: 'image',
      uri: 'file:///x.jpg',
      mime_type: 'image/jpeg',
      source: 'library'
    });
    await deleteAttachment(att.id);
    await expect(listAttachments(m.id)).resolves.toEqual([]);
  });
});
