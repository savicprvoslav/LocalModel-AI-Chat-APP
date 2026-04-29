import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { Project, getProject } from '@/db/projects';
import {
  Conversation,
  listConversationsByProject,
  createConversation
} from '@/db/conversations';
import { listMessages } from '@/db/messages';
import { listEntities } from '@/db/projectEntities';
import { AsciiBlock } from '../components/AsciiBlock';

type Row = {
  conversation: Conversation;
  preview?: string;
};

const formatRelative = (ts: number): string => {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
};

type Props = { projectId: string };

/**
 * Default project landing — shows threads in the project. The project's
 * notes / name / entities live behind the `⚙ EDIT` action in the header
 * (routes to `/project/[id]/edit`), so this screen stays focused on
 * "what conversations exist here?"
 */
export const ProjectThreadsScreen = ({ projectId }: Props) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [entityCount, setEntityCount] = useState(0);

  const reload = useCallback(async () => {
    const p = await getProject(projectId);
    if (!p) {
      router.back();
      return;
    }
    setProject(p);
    const [convs, ents] = await Promise.all([
      listConversationsByProject(projectId),
      listEntities(projectId)
    ]);
    setEntityCount(ents.length);
    const next: Row[] = [];
    for (const c of convs) {
      const msgs = await listMessages(c.id);
      const last = msgs[msgs.length - 1];
      next.push({
        conversation: c,
        ...(last ? { preview: last.content.slice(0, 80) } : {})
      });
    }
    setRows(next);
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const newThread = async () => {
    const c = await createConversation({
      title: 'New conversation',
      project_id: projectId
    });
    router.push(`/conversation/${c.id}`);
  };

  if (!project) return null;

  const subtitle = project.notes.trim()
    ? project.notes.trim().split(/\n+/)[0]?.slice(0, 80) ?? ''
    : `${entityCount} ${entityCount === 1 ? 'entity' : 'entities'} · no notes yet`;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      {/* Header: back + breadcrumb + serif title + edit-project ⚙ */}
      <View
        style={{
          paddingTop: insets.top + t.spacing.md,
          paddingHorizontal: t.spacing.xl,
          paddingBottom: t.spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border.subtle,
          gap: t.spacing.md
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm
          }}
        >
          <Pressable
            onPress={() => router.back()}
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
            <Text style={{ fontFamily: t.fonts.mono, fontSize: 14 }}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ ...t.type.meta, color: t.colors.accent.warm }}>
              {`~/${project.name.toLowerCase().replace(/\s+/g, '-')}`}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push(`/project/${projectId}/edit`)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: t.colors.border.default,
              borderRadius: t.radii.sm
            }}
          >
            <Text style={{ fontFamily: t.fonts.mono, fontSize: 12, color: t.colors.text.tertiary }}>
              ⚙
            </Text>
            <Text style={{ ...t.type.label, color: t.colors.text.primary }}>EDIT</Text>
          </Pressable>
        </View>

        <View>
          <Text
            style={{
              ...t.type.editorialTitle,
              fontSize: 28,
              lineHeight: 32,
              color: t.colors.text.primary,
              marginBottom: t.spacing.xs - 2
            }}
            numberOfLines={1}
          >
            {project.name}
          </Text>
          <Text
            style={{ ...t.type.editorialSub, color: t.colors.text.secondary, fontSize: 14 }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        </View>

        <Pressable
          onPress={newThread}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            backgroundColor: t.colors.accent.inverse,
            borderRadius: t.radii.sm,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text style={{ ...t.type.label, color: t.colors.bg.canvas }}>
            + NEW THREAD IN PROJECT
          </Text>
        </Pressable>
      </View>

      {/* Threads list */}
      {rows.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: t.spacing.xl,
            gap: t.spacing.lg
          }}
        >
          <AsciiBlock>{`  ┌─────────────────┐
  │  no threads     │
  │  in this        │
  │  project yet.   │
  └─────────────────┘`}</AsciiBlock>
          <Text
            style={{
              ...t.type.bodyAi,
              color: t.colors.text.secondary,
              fontSize: 14,
              textAlign: 'center'
            }}
          >
            Conversations you start here will inherit the project's notes and entities.
          </Text>
          <Pressable onPress={newThread}>
            <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
              + START YOUR FIRST THREAD
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.conversation.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + t.spacing.xl }}
          ListHeaderComponent={
            <View
              style={{
                paddingHorizontal: t.spacing.xl,
                paddingTop: t.spacing.lg,
                paddingBottom: t.spacing.sm
              }}
            >
              <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
                {`# ${rows.length === 1 ? 'thread' : 'threads'} // ${rows.length} in ~/${project.name.toLowerCase()}`}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const c = item.conversation;
            return (
              <Pressable
                onPress={() => router.push(`/conversation/${c.id}`)}
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
                  <Text
                    style={{
                      ...t.type.gutter,
                      color: t.colors.text.quiet,
                      width: 24,
                      textAlign: 'right',
                      paddingTop: 3
                    }}
                  >
                    {String(index + 1).padStart(2, '0')}
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
                        style={{
                          ...t.type.displaySerif,
                          color: t.colors.text.primary,
                          flex: 1
                        }}
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
        />
      )}
    </View>
  );
};
