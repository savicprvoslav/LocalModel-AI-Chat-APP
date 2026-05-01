import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { Skill, listSkills, deleteSkill, duplicateSkill, createSkill } from '@/db/skills';
import { createConversation } from '@/db/conversations';
import { listPersonas } from '@/db/personas';
import { importSkillFromMarkdown } from '@/skills/importSkill';
import { draftSkill, SkillDraft } from '@/skills/draftSkill';
import { getEngine } from '@/engine';
import { SectionHeader } from '../components/SectionHeader';
import { FenceBox } from '../components/FenceBox';
import { ActionSheet, ActionSheetItem } from '../components/ActionSheet';
import { PromptModal } from '../components/PromptModal';
import { DraftSkillModal } from '../components/DraftSkillModal';

export const SkillsScreen = () => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [sheetFor, setSheetFor] = useState<Skill | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);

  const reload = useCallback(async () => {
    setSkills(await listSkills());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const onDraftStart = () => {
    if (!getEngine().isReady()) {
      Alert.alert(
        'Model not loaded',
        'Open a chat once to load the active model, then try drafting again.'
      );
      return;
    }
    setDraftOpen(true);
  };

  const onDraftGenerate = async (
    description: string,
    signal: AbortSignal
  ): Promise<SkillDraft> => {
    const personas = await listPersonas();
    return draftSkill(getEngine(), { description, personas, signal });
  };

  const onDraftAccept = async (d: SkillDraft) => {
    setDraftOpen(false);
    const skill = await createSkill({
      name: d.name,
      description: d.description,
      emoji: '✨',
      category: 'drafted',
      system_prompt: d.system_prompt,
      starter_text: d.starter_text,
      placeholder_text: d.placeholder_text,
      default_persona_id: d.default_persona_id,
      temperature: d.temperature,
      is_builtin: false,
      sort_order: 999
    });
    await reload();
    router.push(`/skill/${skill.id}`);
  };

  const onImport = async (raw: string) => {
    setImportOpen(false);
    const trimmed = raw.trim();
    if (!trimmed) return;
    try {
      const r = await importSkillFromMarkdown(trimmed);
      await reload();
      const next = () => router.push(`/skill/${r.skill.id}`);
      if (r.warning) {
        Alert.alert('Imported with caveat', r.warning, [{ text: 'OK', onPress: next }]);
      } else {
        next();
      }
    } catch (e) {
      Alert.alert(
        'Could not import skill',
        e instanceof Error ? e.message : 'Unknown error parsing SKILL.md.'
      );
    }
  };

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

  const useInNewChat = async (s: Skill) => {
    const c = await createConversation({
      title: s.name,
      system_prompt: s.system_prompt,
      persona_id: s.default_persona_id,
      skill_id: s.id
    });
    router.push({
      pathname: `/conversation/${c.id}`,
      params: s.starter_text ? { starter: s.starter_text } : {}
    });
  };

  const sheetActions: ActionSheetItem[] = sheetFor
    ? [
        {
          label: 'Use in new chat',
          kind: 'warm',
          glyph: '▸',
          onPress: () => void useInNewChat(sheetFor)
        },
        {
          label: 'Edit',
          glyph: '✎',
          onPress: () => router.push(`/skill/${sheetFor.id}`)
        },
        {
          label: 'Duplicate',
          glyph: '⧉',
          onPress: async () => {
            const copy = await duplicateSkill(sheetFor.id);
            await reload();
            router.push(`/skill/${copy.id}`);
          }
        },
        {
          label: sheetFor.is_builtin === 1 ? 'Built-in (cannot delete)' : 'Delete',
          kind: 'destructive',
          disabled: sheetFor.is_builtin === 1,
          onPress: () => onDelete(sheetFor)
        }
      ]
    : [];

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
          <Text style={{ ...t.type.meta, color: t.colors.accent.warm }}>~/skills</Text>
          <Text style={{ ...t.type.displaySerifLg, color: t.colors.text.primary }}>
            skills
          </Text>
        </View>
        <Pressable
          onPress={onDraftStart}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: t.colors.border.default,
            borderRadius: t.radii.sm
          }}
        >
          <Text style={{ ...t.type.label, color: t.colors.text.primary }}>✨ DRAFT</Text>
        </Pressable>
        <Pressable
          onPress={() => setImportOpen(true)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: t.colors.border.default,
            borderRadius: t.radii.sm
          }}
        >
          <Text style={{ ...t.type.label, color: t.colors.text.primary }}>IMPORT</Text>
        </Pressable>
        <Pressable
          onPress={onNew}
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

      <ScrollView contentContainerStyle={{ padding: t.spacing.xl }}>
        <SectionHeader label="commands" comment={`${skills.length} defined`} />
        <Text
          style={{
            ...t.type.meta,
            color: t.colors.text.quiet,
            marginBottom: t.spacing.lg
          }}
        >
          Slash commands. Tap from the home screen, or use this list to edit, duplicate, or
          start a new chat from one.
        </Text>

        {skills.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setSheetFor(s)}
            style={{
              padding: t.spacing.md + 2,
              borderWidth: 1,
              borderColor: t.colors.border.subtle,
              borderRadius: t.radii.sm,
              marginBottom: t.spacing.sm + 2
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: t.spacing.sm,
                marginBottom: 6
              }}
            >
              <Text
                style={{
                  fontFamily: t.fonts.mono,
                  fontSize: 15,
                  color: t.colors.accent.warm
                }}
              >
                /
              </Text>
              <Text style={{ ...t.type.displaySerif, color: t.colors.text.primary, flex: 1 }}>
                {s.name}
              </Text>
              {s.is_builtin === 1 ? (
                <Text style={{ ...t.type.label, color: t.colors.text.quiet }}>BUILT-IN</Text>
              ) : null}
            </View>
            {s.description ? (
              <Text
                style={{
                  ...t.type.bodyAi,
                  color: t.colors.text.secondary,
                  fontSize: 14,
                  lineHeight: 21,
                  marginBottom: t.spacing.sm + 2
                }}
              >
                {s.description}
              </Text>
            ) : null}
            {s.system_prompt ? (
              <FenceBox lang="prompt" paddingV={8} paddingH={10}>
                <Text
                  style={{
                    fontFamily: t.fonts.mono,
                    fontSize: 11,
                    lineHeight: 16,
                    color: t.colors.text.secondary
                  }}
                  numberOfLines={3}
                >
                  {s.system_prompt}
                </Text>
              </FenceBox>
            ) : null}
          </Pressable>
        ))}
        <View style={{ height: insets.bottom + t.spacing.xl }} />
      </ScrollView>

      <ActionSheet
        visible={sheetFor !== null}
        onClose={() => setSheetFor(null)}
        title={sheetFor ? `~/skills/${sheetFor.name.toLowerCase().replace(/\s+/g, '-')}` : ''}
        subtitle={sheetFor ? `/${sheetFor.name}` : ''}
        actions={sheetActions}
      />

      <PromptModal
        visible={importOpen}
        title="Import SKILL.md"
        hint="Paste the contents of a SKILL.md file (frontmatter + instructions). Supports Google AI Edge Gallery format. JS/native skills import the prompt only."
        placeholder={'---\nname: my-skill\ndescription: …\n---\n\nInstructions…'}
        multiline
        submitLabel="Import"
        onSubmit={(v) => void onImport(v)}
        onCancel={() => setImportOpen(false)}
      />

      <DraftSkillModal
        visible={draftOpen}
        onGenerate={onDraftGenerate}
        onAccept={(d) => void onDraftAccept(d)}
        onCancel={() => setDraftOpen(false)}
      />
    </View>
  );
};
