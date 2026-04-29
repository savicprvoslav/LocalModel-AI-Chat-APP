import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { PromptModal } from '../components/PromptModal';
import { Project, listProjects, createProject } from '@/db/projects';
import { listConversationsByProject } from '@/db/conversations';
import { listEntities } from '@/db/projectEntities';

type Row = {
  project: Project;
  conversationCount: number;
  entityCount: number;
};

export const ProjectsScreen = () => {
  const t = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [newOpen, setNewOpen] = useState(false);

  const reload = useCallback(async () => {
    const projects = await listProjects();
    const out: Row[] = [];
    for (const p of projects) {
      const [convs, ents] = await Promise.all([
        listConversationsByProject(p.id),
        listEntities(p.id)
      ]);
      out.push({ project: p, conversationCount: convs.length, entityCount: ents.length });
    }
    setRows(out);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const handleNewSubmit = async (name: string) => {
    setNewOpen(false);
    const trimmed = name.trim();
    if (!trimmed) return;
    const p = await createProject({ name: trimmed });
    router.push(`/project/${p.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text>
          </Pressable>
        }
        title="projects"
        right={
          <Pressable onPress={() => setNewOpen(true)}>
            <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ NEW</Text>
          </Pressable>
        }
      />
      {rows.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: t.spacing.xl,
            gap: t.spacing.md
          }}
        >
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
            ~/no projects yet
          </Text>
          <Text
            style={{
              ...t.type.bodyAi,
              color: t.colors.text.secondary,
              textAlign: 'center',
              fontSize: 14
            }}
          >
            Group related conversations under a project. Add notes and entities to give the
            assistant shared context across every conversation in it.
          </Text>
          <Pressable onPress={() => setNewOpen(true)} style={{ marginTop: t.spacing.md }}>
            <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ NEW PROJECT</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.project.id}
          contentContainerStyle={{ paddingBottom: t.spacing.xxl }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/project/${item.project.id}`)}
              style={{
                paddingHorizontal: t.spacing.lg,
                paddingVertical: t.spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: t.colors.border.subtle
              }}
            >
              <Text
                style={{
                  ...t.type.label,
                  color: t.colors.text.tertiary,
                  marginBottom: t.spacing.xs
                }}
              >
                ~/{item.project.name.toUpperCase()}
              </Text>
              <Text
                style={{
                  ...t.type.bodyAi,
                  color: t.colors.text.secondary,
                  fontSize: 14
                }}
                numberOfLines={2}
              >
                {item.project.notes.trim() || 'no notes yet'}
              </Text>
              <Text
                style={{
                  ...t.type.meta,
                  color: t.colors.text.quiet,
                  marginTop: t.spacing.xs
                }}
              >
                {item.conversationCount} conv · {item.entityCount} entit
                {item.entityCount === 1 ? 'y' : 'ies'}
              </Text>
            </Pressable>
          )}
        />
      )}
      <PromptModal
        visible={newOpen}
        title="New project"
        hint="A short name. You can add notes and entities afterwards."
        placeholder="e.g. Acme Q4"
        submitLabel="Create"
        onSubmit={handleNewSubmit}
        onCancel={() => setNewOpen(false)}
      />
    </View>
  );
};
