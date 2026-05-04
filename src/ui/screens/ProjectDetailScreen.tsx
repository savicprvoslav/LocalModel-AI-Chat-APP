import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { Project, getProject, updateProject, deleteProject } from '@/db/projects';
import { getRag } from '@/integration/rag';
import type { Fact } from '@/rag';

type Props = { projectId: string };

export const ProjectDetailScreen = ({ projectId }: Props) => {
  const t = useTheme();
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [entities, setEntities] = useState<Fact[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entityTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const reloadEntities = async () => {
    setEntities(await getRag().listFacts(projectId));
  };

  useEffect(() => {
    void (async () => {
      const p = await getProject(projectId);
      if (p) {
        setProject(p);
        setName(p.name);
        setNotes(p.notes);
      }
      await reloadEntities();
    })();
  }, [projectId]);

  const queueSave = (next: { name?: string; notes?: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateProject(projectId, next);
    }, 500);
  };

  const onChangeName = (v: string) => {
    setName(v);
    queueSave({ name: v });
  };
  const onChangeNotes = (v: string) => {
    setNotes(v);
    queueSave({ notes: v });
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete project?',
      'This deletes all conversations in this project.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteProject(projectId);
            router.replace('/');
          }
        }
      ]
    );
  };

  const queueEntitySave = (
    id: string,
    next: { name?: string; description?: string }
  ) => {
    const existing = entityTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      void getRag().updateFact(id, next);
    }, 500);
    entityTimers.current.set(id, timer);
  };

  const onEntityChange = (id: string, field: 'name' | 'description', v: string) => {
    setEntities((arr) =>
      arr.map((e) => (e.id === id ? { ...e, [field]: v } : e))
    );
    queueEntitySave(id, { [field]: v });
  };

  const onAddEntity = async () => {
    await getRag().saveFact({ projectId, name: '', description: '' });
    await reloadEntities();
  };

  const onDeleteEntity = (id: string) => {
    Alert.alert('Delete entity?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await getRag().deleteFact(id);
          await reloadEntities();
        }
      }
    ]);
  };

  if (!project) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text>
          </Pressable>
        }
        title={`${project.name} · settings`}
        right={
          <Pressable onPress={confirmDelete}>
            <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>DELETE</Text>
          </Pressable>
        }
      />
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>NAME</Text>
        <TextInput
          value={name}
          onChangeText={onChangeName}
          style={{
            ...t.type.heading,
            color: t.colors.text.primary,
            borderBottomWidth: 1,
            borderBottomColor: t.colors.border.subtle,
            paddingVertical: t.spacing.xs
          }}
        />
        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.lg
          }}
        >
          NOTES
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
          What you tell the model about this project. Prepended to every conversation.
        </Text>
        <TextInput
          value={notes}
          onChangeText={onChangeNotes}
          multiline
          textAlignVertical="top"
          placeholder="Tom is the backend lead, worried about Q4 timeline…"
          placeholderTextColor={t.colors.text.quiet}
          style={{
            ...t.type.bodyAi,
            color: t.colors.text.primary,
            fontSize: 15,
            minHeight: 160,
            padding: t.spacing.md,
            borderWidth: 1,
            borderColor: t.colors.border.subtle,
            borderRadius: t.radii.sm
          }}
        />

        <View style={{ marginTop: t.spacing.xl }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: t.spacing.xs
            }}
          >
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>ENTITIES</Text>
            <Pressable onPress={onAddEntity}>
              <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ ADD</Text>
            </Pressable>
          </View>
          <Text
            style={{
              ...t.type.meta,
              color: t.colors.text.quiet,
              marginBottom: t.spacing.sm
            }}
          >
            People, places, or things the assistant should know. Each entity becomes a &quot;name:
            description&quot; line in the system prompt.
          </Text>
          {entities.length === 0 ? (
            <Pressable
              onPress={onAddEntity}
              style={{
                paddingVertical: t.spacing.md,
                alignItems: 'center',
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: t.colors.border.subtle,
                borderRadius: t.radii.sm
              }}
            >
              <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
                no entities yet — tap to add one
              </Text>
            </Pressable>
          ) : null}
          {entities.map((e) => (
            <View
              key={e.id}
              style={{
                flexDirection: 'row',
                gap: t.spacing.sm,
                marginBottom: t.spacing.xs,
                alignItems: 'flex-start'
              }}
            >
              <TextInput
                value={e.name}
                onChangeText={(v) => onEntityChange(e.id, 'name', v)}
                placeholder="Name"
                placeholderTextColor={t.colors.text.quiet}
                style={{
                  ...t.type.bodyUser,
                  color: t.colors.text.primary,
                  borderWidth: 1,
                  borderColor: t.colors.border.subtle,
                  borderRadius: t.radii.sm,
                  padding: t.spacing.sm,
                  width: 110
                }}
              />
              <TextInput
                value={e.description}
                onChangeText={(v) => onEntityChange(e.id, 'description', v)}
                placeholder="Description"
                placeholderTextColor={t.colors.text.quiet}
                multiline
                style={{
                  ...t.type.bodyUser,
                  color: t.colors.text.primary,
                  borderWidth: 1,
                  borderColor: t.colors.border.subtle,
                  borderRadius: t.radii.sm,
                  padding: t.spacing.sm,
                  flex: 1,
                  minHeight: 36
                }}
              />
              <Pressable
                onPress={() => onDeleteEntity(e.id)}
                hitSlop={8}
                style={{ paddingTop: t.spacing.sm }}
              >
                <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Footer link back to threads — conversations list now lives on the
            threads view (`/project/[id]`). This screen is settings-only. */}
        <Pressable
          onPress={() => router.replace(`/project/${projectId}`)}
          style={{
            marginTop: t.spacing.xl,
            paddingVertical: t.spacing.md,
            alignItems: 'center'
          }}
        >
          <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
            ← BACK TO {project.name.toUpperCase()} THREADS
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};
