import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  Skill,
  listSkills,
  deleteSkill,
  duplicateSkill,
  createSkill
} from '@/db/skills';

export const SkillsScreen = () => {
  const t = useTheme();
  const [skills, setSkills] = useState<Skill[]>([]);

  const reload = useCallback(async () => {
    setSkills(await listSkills());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const onDelete = (s: Skill) => {
    if (s.is_builtin === 1) {
      Alert.alert(
        'Built-in skill',
        'Built-in skills can be edited but not deleted. Want to duplicate it as a custom skill?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Duplicate',
            onPress: async () => {
              const copy = await duplicateSkill(s.id);
              await reload();
              router.push(`/skill/${copy.id}`);
            }
          }
        ]
      );
      return;
    }
    Alert.alert('Delete skill?', `"${s.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSkill(s.id);
          await reload();
        }
      }
    ]);
  };

  const onNew = async () => {
    const s = await createSkill({
      name: 'New skill',
      emoji: '✨',
      system_prompt: 'You are a helpful assistant.',
      placeholder_text: 'What do you want help with?',
      sort_order: 999
    });
    router.push(`/skill/${s.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text>
          </Pressable>
        }
        title="skills"
        right={
          <Pressable onPress={onNew}>
            <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ NEW</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg }}>
        <Text
          style={{
            ...t.type.meta,
            color: t.colors.text.tertiary,
            marginBottom: t.spacing.md
          }}
        >
          Skills are task starters. Each one preconfigures a conversation with a system prompt
          and starting placeholder. Tap a skill chip on the home screen to start one.
        </Text>
        {skills.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => router.push(`/skill/${s.id}`)}
            onLongPress={() => onDelete(s)}
            style={{
              borderWidth: 1,
              borderColor: t.colors.border.subtle,
              borderRadius: t.radii.md,
              padding: t.spacing.md,
              marginBottom: t.spacing.sm
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: t.spacing.xs,
                gap: t.spacing.sm
              }}
            >
              {s.emoji ? <Text style={{ fontSize: 18 }}>{s.emoji}</Text> : null}
              <Text
                style={{ ...t.type.bodyUser, color: t.colors.text.primary, flex: 1 }}
              >
                {s.name}
              </Text>
              {s.is_builtin === 1 ? (
                <Text style={{ ...t.type.label, color: t.colors.text.quiet }}>
                  BUILT-IN
                </Text>
              ) : null}
            </View>
            {s.description ? (
              <Text
                style={{
                  ...t.type.bodyAi,
                  color: t.colors.text.secondary,
                  fontSize: 14
                }}
              >
                {s.description}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};
