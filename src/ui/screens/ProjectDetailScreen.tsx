import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { Project, getProject, updateProject, deleteProject } from '@/db/projects';
import {
  Conversation,
  listConversationsByProject,
  createConversation
} from '@/db/conversations';

type Props = { projectId: string };

export const ProjectDetailScreen = ({ projectId }: Props) => {
  const t = useTheme();
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      const p = await getProject(projectId);
      if (p) {
        setProject(p);
        setName(p.name);
        setNotes(p.notes);
      }
      setConversations(await listConversationsByProject(projectId));
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

  const newInProject = async () => {
    const c = await createConversation({
      title: 'New conversation',
      project_id: projectId
    });
    router.push(`/conversation/${c.id}`);
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

  if (!project) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text>
          </Pressable>
        }
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
          <Text
            style={{
              ...t.type.label,
              color: t.colors.text.tertiary,
              marginBottom: t.spacing.sm
            }}
          >
            CONVERSATIONS
          </Text>
          {conversations.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/conversation/${c.id}`)}
              style={{ paddingVertical: t.spacing.sm }}
            >
              <Text style={{ ...t.type.bodyUser, color: t.colors.text.primary }}>
                {c.title}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={newInProject} style={{ marginTop: t.spacing.sm }}>
            <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
              + NEW CONVERSATION IN PROJECT
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
};
