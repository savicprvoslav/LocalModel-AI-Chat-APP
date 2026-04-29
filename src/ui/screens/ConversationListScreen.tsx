import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { EditorialHeader } from '../components/EditorialHeader';
import { AsciiRule } from '../components/AsciiRule';
import { AsciiBlock } from '../components/AsciiBlock';
import { Project, listProjects } from '@/db/projects';
import {
  Conversation,
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation
} from '@/db/conversations';
import { listMessages } from '@/db/messages';
import { Skill, listSkills } from '@/db/skills';
import { PromptModal } from '../components/PromptModal';
import { ActionSheet, ActionSheetItem } from '../components/ActionSheet';
import { SideMenu } from '../components/SideMenu';

type Row =
  | { type: 'project-header'; project: Project; count: number }
  | { type: 'inbox-header'; count: number }
  | { type: 'conversation'; conversation: Conversation; index: number; preview?: string };

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
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [convCount, setConvCount] = useState(0);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [sheetTarget, setSheetTarget] = useState<Conversation | null>(null);
  const [moveTarget, setMoveTarget] = useState<Conversation | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(async () => {
    setSkills(await listSkills());
    const [projectsList, conversations] = await Promise.all([
      listProjects(),
      listConversations()
    ]);
    setProjects(projectsList);
    setConvCount(conversations.length);

    const byProject = new Map<string | null, Conversation[]>();
    for (const c of conversations) {
      const k = c.project_id;
      if (!byProject.has(k)) byProject.set(k, []);
      byProject.get(k)!.push(c);
    }
    const out: Row[] = [];
    if (byProject.has(null)) {
      const inbox = byProject.get(null)!;
      out.push({ type: 'inbox-header', count: inbox.length });
      for (let i = 0; i < inbox.length; i++) {
        const c = inbox[i]!;
        const msgs = await listMessages(c.id);
        const last = msgs[msgs.length - 1];
        out.push({
          type: 'conversation',
          conversation: c,
          index: i + 1,
          ...(last ? { preview: last.content.slice(0, 80) } : {})
        });
      }
    }
    for (const p of projectsList) {
      const list = byProject.get(p.id);
      if (!list) continue;
      out.push({ type: 'project-header', project: p, count: list.length });
      for (let i = 0; i < list.length; i++) {
        const c = list[i]!;
        const msgs = await listMessages(c.id);
        const last = msgs[msgs.length - 1];
        out.push({
          type: 'conversation',
          conversation: c,
          index: i + 1,
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

  const startFromSkill = async (skill: Skill) => {
    const c = await createConversation({
      title: skill.name,
      system_prompt: skill.system_prompt,
      persona_id: skill.default_persona_id,
      skill_id: skill.id
    });
    router.push({
      pathname: `/conversation/${c.id}`,
      params: skill.starter_text ? { starter: skill.starter_text } : {}
    });
  };

  const promptRename = (c: Conversation) => setRenameTarget(c);

  const handleRenameSubmit = async (text: string) => {
    const target = renameTarget;
    setRenameTarget(null);
    if (!target) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    await updateConversation(target.id, { title: trimmed });
    await reload();
  };

  const confirmDelete = (c: Conversation) => {
    Alert.alert('Delete conversation?', `"${c.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteConversation(c.id);
          await reload();
        }
      }
    ]);
  };

  const onLongPress = (c: Conversation) => setSheetTarget(c);

  const sheetActions: ActionSheetItem[] = sheetTarget
    ? [
        {
          label: 'Rename',
          glyph: '✎',
          onPress: () => promptRename(sheetTarget)
        },
        {
          label: 'Move to project',
          glyph: '↦',
          onPress: () => setMoveTarget(sheetTarget)
        },
        {
          label: 'Delete conversation',
          kind: 'destructive',
          onPress: () => confirmDelete(sheetTarget)
        }
      ]
    : [];

  const moveActions: ActionSheetItem[] = moveTarget
    ? [
        {
          label: 'Inbox (no project)',
          glyph: '~',
          onPress: async () => {
            await updateConversation(moveTarget.id, { project_id: null });
            await reload();
          }
        },
        ...projects.map(
          (p): ActionSheetItem => ({
            label: p.name,
            glyph: '/',
            onPress: async () => {
              await updateConversation(moveTarget.id, { project_id: p.id });
              await reload();
            }
          })
        )
      ]
    : [];

  // Header actions: + NEW THREAD + ⌕ search. (Settings + projects nav now live in the SideMenu.)
  const headerActions = (
    <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
      <Pressable
        onPress={newConversation}
        style={{
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: t.colors.accent.inverse,
          borderRadius: t.radii.sm,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Text style={{ ...t.type.label, color: t.colors.bg.canvas }}>+ NEW THREAD</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/search')}
        style={{
          width: 44,
          height: 38,
          borderWidth: 1,
          borderColor: t.colors.border.default,
          borderRadius: t.radii.sm,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Text style={{ ...t.type.heading, color: t.colors.text.tertiary }}>⌕</Text>
      </Pressable>
    </View>
  );

  // ☰ leading element opens the SideMenu. Sits on the far left of the eyebrow row.
  const leadingMenu = (
    <Pressable
      onPress={() => setMenuOpen(true)}
      hitSlop={8}
      style={{
        width: 32,
        height: 32,
        borderWidth: 1,
        borderColor: t.colors.border.default,
        borderRadius: t.radii.sm,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text style={{ fontFamily: t.fonts.mono, fontSize: 14, color: t.colors.text.primary }}>
        ☰
      </Text>
    </Pressable>
  );

  const empty = (
    <View
      style={{
        paddingVertical: 64,
        alignItems: 'center',
        gap: t.spacing.lg
      }}
    >
      <AsciiBlock>{`  ┌─────────────┐
  │   empty.    │
  │   no chats  │
  │   yet.      │
  └─────────────┘`}</AsciiBlock>
      <Pressable onPress={newConversation}>
        <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
          + START YOUR FIRST THREAD
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <EditorialHeader
        leading={leadingMenu}
        eyebrow={`LOCAL · ONLINE · ${convCount} ${convCount === 1 ? 'CHAT' : 'CHATS'}`}
        pulse
        title="conversations"
        subtitle="private threads, persisted to disk."
        actions={headerActions}
      />

      {rows.length === 0 && skills.length === 0 ? (
        empty
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
          ListHeaderComponent={
            skills.length > 0 ? (
              <View style={{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.lg }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: t.spacing.sm + 2
                  }}
                >
                  <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
                    $ start with
                  </Text>
                  <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
                    {`${skills.length} skills`}
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}
                >
                  {skills.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => startFromSkill(s)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderWidth: 1,
                        borderColor: t.colors.border.default,
                        borderRadius: t.radii.sm
                      }}
                    >
                      <Text style={{ ...t.type.bodyUserV2, color: t.colors.accent.warm }}>/</Text>
                      <Text style={{ ...t.type.bodyUserV2, color: t.colors.text.secondary }}>
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.type === 'inbox-header') {
              return (
                <View style={{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md }}>
                  <AsciiRule />
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginTop: t.spacing.sm,
                      marginBottom: t.spacing.sm
                    }}
                  >
                    <Text style={{ ...t.type.label, color: t.colors.text.primary }}>~/INBOX</Text>
                    <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
                      {`${item.count} ${item.count === 1 ? 'thread' : 'threads'}`}
                    </Text>
                  </View>
                </View>
              );
            }
            if (item.type === 'project-header') {
              return (
                <Pressable
                  onPress={() => router.push(`/project/${item.project.id}`)}
                  style={{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.md }}
                >
                  <AsciiRule />
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginTop: t.spacing.sm,
                      marginBottom: t.spacing.sm
                    }}
                  >
                    <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
                      {`~/${item.project.name.toUpperCase()}`}
                    </Text>
                    <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
                      {`${item.count} threads · open ›`}
                    </Text>
                  </View>
                </Pressable>
              );
            }
            const c = item.conversation;
            return (
              <Pressable
                onPress={() => router.push(`/conversation/${c.id}`)}
                onLongPress={() => onLongPress(c)}
                delayLongPress={400}
                style={{
                  paddingHorizontal: t.spacing.xl,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: t.colors.border.subtle
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    gap: t.spacing.md
                  }}
                >
                  {/* Marginalia rail with the index */}
                  <Text
                    style={{
                      ...t.type.gutter,
                      color: t.colors.text.quiet,
                      width: 24,
                      textAlign: 'right',
                      paddingTop: 3
                    }}
                  >
                    {String(item.index).padStart(2, '0')}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: t.spacing.sm,
                        marginBottom: 4
                      }}
                    >
                      <Text
                        style={{ ...t.type.displaySerif, color: t.colors.text.primary, flex: 1 }}
                        numberOfLines={1}
                      >
                        {c.title}
                      </Text>
                      <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
                        {formatRelative(c.updated_at)}
                      </Text>
                    </View>
                    {item.preview ? (
                      <Text
                        style={{
                          fontFamily: t.fonts.mono,
                          fontSize: 12,
                          lineHeight: 17,
                          color: t.colors.text.tertiary
                        }}
                        numberOfLines={1}
                      >
                        <Text style={{ color: t.colors.text.quiet }}>{'› '}</Text>
                        {item.preview}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListFooterComponent={<View style={{ height: t.spacing.xl }} />}
        />
      )}

      <PromptModal
        visible={renameTarget !== null}
        title="Rename conversation"
        initialValue={renameTarget?.title ?? ''}
        onSubmit={handleRenameSubmit}
        onCancel={() => setRenameTarget(null)}
      />
      <ActionSheet
        visible={sheetTarget !== null}
        onClose={() => setSheetTarget(null)}
        title={sheetTarget ? `~/${sheetTarget.title.toLowerCase().replace(/\s+/g, '-').slice(0, 28)}` : ''}
        subtitle={sheetTarget?.title}
        actions={sheetActions}
      />
      <ActionSheet
        visible={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        title="move to project"
        subtitle={moveTarget?.title}
        actions={moveActions}
      />
      <SideMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNewThread={newConversation}
      />
    </View>
  );
};
