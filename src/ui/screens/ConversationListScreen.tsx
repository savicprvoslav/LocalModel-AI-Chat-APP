import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { Project, listProjects } from '@/db/projects';
import { Conversation, listConversations, createConversation } from '@/db/conversations';
import { listMessages } from '@/db/messages';

type Row =
  | { type: 'project-header'; project: Project }
  | { type: 'inbox-header' }
  | { type: 'conversation'; conversation: Conversation; preview?: string };

const formatRelative = (ts: number): string => {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
};

export const ConversationListScreen = () => {
  const t = useTheme();
  const [rows, setRows] = useState<Row[]>([]);

  const reload = useCallback(async () => {
    const [projects, conversations] = await Promise.all([listProjects(), listConversations()]);
    const byProject = new Map<string | null, Conversation[]>();
    for (const c of conversations) {
      const k = c.project_id;
      if (!byProject.has(k)) byProject.set(k, []);
      byProject.get(k)!.push(c);
    }
    const out: Row[] = [];
    if (byProject.has(null)) {
      out.push({ type: 'inbox-header' });
      for (const c of byProject.get(null)!) {
        const msgs = await listMessages(c.id);
        const last = msgs[msgs.length - 1];
        out.push({
          type: 'conversation',
          conversation: c,
          ...(last ? { preview: last.content.slice(0, 80) } : {})
        });
      }
    }
    for (const p of projects) {
      const list = byProject.get(p.id);
      if (!list) continue;
      out.push({ type: 'project-header', project: p });
      for (const c of list) {
        const msgs = await listMessages(c.id);
        const last = msgs[msgs.length - 1];
        out.push({
          type: 'conversation',
          conversation: c,
          ...(last ? { preview: last.content.slice(0, 80) } : {})
        });
      }
    }
    setRows(out);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const newConversation = async () => {
    const c = await createConversation({ title: 'New conversation' });
    router.push(`/conversation/${c.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        title="local chat"
        right={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Pressable onPress={newConversation}>
              <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ NEW</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/settings')}>
              <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>⚙</Text>
            </Pressable>
          </View>
        }
      />
      {rows.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
            ~/no conversations yet
          </Text>
          <Pressable onPress={newConversation} style={{ marginTop: t.spacing.md }}>
            <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ NEW</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) =>
            r.type === 'conversation'
              ? `conv-${r.conversation.id}`
              : r.type === 'project-header'
                ? `ph-${r.project.id}`
                : `inbox-${i}`
          }
          renderItem={({ item }) => {
            if (item.type === 'inbox-header')
              return (
                <Text
                  style={{
                    ...t.type.label,
                    color: t.colors.text.tertiary,
                    paddingHorizontal: t.spacing.lg,
                    paddingTop: t.spacing.lg,
                    paddingBottom: t.spacing.xs
                  }}
                >
                  ~/INBOX
                </Text>
              );
            if (item.type === 'project-header')
              return (
                <Pressable onPress={() => router.push(`/project/${item.project.id}`)}>
                  <Text
                    style={{
                      ...t.type.label,
                      color: t.colors.text.tertiary,
                      paddingHorizontal: t.spacing.lg,
                      paddingTop: t.spacing.lg,
                      paddingBottom: t.spacing.xs
                    }}
                  >
                    ~/{item.project.name.toUpperCase()}
                  </Text>
                </Pressable>
              );
            const c = item.conversation;
            return (
              <Pressable
                onPress={() => router.push(`/conversation/${c.id}`)}
                style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm + 2 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline'
                  }}
                >
                  <Text
                    style={{ ...t.type.bodyUser, color: t.colors.text.primary, flex: 1 }}
                    numberOfLines={1}
                  >
                    {c.title}
                  </Text>
                  <Text
                    style={{
                      ...t.type.meta,
                      color: t.colors.text.tertiary,
                      marginLeft: t.spacing.sm
                    }}
                  >
                    {formatRelative(c.updated_at)}
                  </Text>
                </View>
                {item.preview ? (
                  <Text
                    style={{
                      ...t.type.bodyAi,
                      color: t.colors.text.tertiary,
                      fontSize: 13
                    }}
                    numberOfLines={1}
                  >
                    {item.preview}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
};
