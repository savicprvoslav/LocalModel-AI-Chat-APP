import { useCallback, useState } from 'react';
import { Pressable, Text, View, FlatList } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { Project, listProjects, createProject } from '@/db/projects';
import { listConversationsByProject } from '@/db/conversations';
import { listEntities } from '@/db/projectEntities';
import { PromptModal } from '../components/PromptModal';
import { Numeral } from '../components/Numeral';
import { SectionHeader } from '../components/SectionHeader';
import { AsciiBlock } from '../components/AsciiBlock';

type Row = {
  project: Project;
  conversationCount: number;
  entityCount: number;
};

export const ProjectsScreen = () => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
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

  const empty = (
    <View
      style={{
        paddingVertical: 64,
        paddingHorizontal: t.spacing.xl,
        alignItems: 'center',
        gap: t.spacing.lg
      }}
    >
      <AsciiBlock>{`  ┌──────────────────┐
  │  no projects.    │
  │  group convos    │
  │  with shared     │
  │  context here.   │
  └──────────────────┘`}</AsciiBlock>
      <Text
        style={{
          ...t.type.bodyAi,
          color: t.colors.text.secondary,
          textAlign: 'center',
          fontSize: 14
        }}
      >
        A project pins notes and entities (people, products, places) so every conversation
        in it inherits that context.
      </Text>
      <Pressable onPress={() => setNewOpen(true)}>
        <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ NEW PROJECT</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <View
        style={{
          paddingTop: insets.top + t.spacing.md,
          paddingHorizontal: t.spacing.xl,
          paddingBottom: t.spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border.subtle,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md
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
          <Text style={{ ...t.type.meta, color: t.colors.accent.warm }}>~/projects</Text>
          <Text style={{ ...t.type.displaySerifLg, color: t.colors.text.primary }}>
            projects
          </Text>
        </View>
        <Pressable
          onPress={() => setNewOpen(true)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: t.colors.border.default,
            borderRadius: t.radii.sm
          }}
        >
          <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ NEW</Text>
        </Pressable>
      </View>

      {rows.length === 0 ? (
        empty
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.project.id}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.lg }}>
              <SectionHeader
                label="contexts"
                comment={`${rows.length} ${rows.length === 1 ? 'project' : 'projects'}`}
              />
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + t.spacing.xl }}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => router.push(`/project/${item.project.id}`)}
              style={{
                flexDirection: 'row',
                gap: 14,
                marginHorizontal: t.spacing.xl,
                marginBottom: t.spacing.sm + 2,
                padding: t.spacing.lg,
                borderWidth: 1,
                borderColor: t.colors.border.default,
                borderRadius: t.radii.md
              }}
            >
              <View style={{ width: 44 }}>
                <Numeral>{index + 1}</Numeral>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
                  {`~/${item.project.name.toUpperCase()}`}
                </Text>
                <Text
                  style={{
                    ...t.type.displaySerif,
                    color: t.colors.text.primary,
                    marginTop: 4,
                    marginBottom: 6
                  }}
                >
                  {item.project.name}
                </Text>
                <Text
                  style={{
                    ...t.type.bodyAi,
                    color: t.colors.text.secondary,
                    fontSize: 14,
                    lineHeight: 21
                  }}
                  numberOfLines={2}
                >
                  {item.project.notes.trim() || 'no notes yet — add some context for the model.'}
                </Text>
                <Text
                  style={{
                    ...t.type.metaV2,
                    color: t.colors.text.quiet,
                    marginTop: t.spacing.sm
                  }}
                >
                  {`${item.conversationCount} conv · ${item.entityCount} entit${item.entityCount === 1 ? 'y' : 'ies'}`}
                </Text>
              </View>
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
