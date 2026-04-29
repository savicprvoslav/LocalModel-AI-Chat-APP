import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { Skill, getSkill, updateSkill } from '@/db/skills';
import { Persona, listPersonas } from '@/db/personas';
import { CATALOG } from '@/model/catalog';

type Props = { skillId: string };

export const SkillEditScreen = ({ skillId }: Props) => {
  const t = useTheme();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [starterText, setStarterText] = useState('');
  const [placeholderText, setPlaceholderText] = useState('');
  const [defaultPersonaId, setDefaultPersonaId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [tempStr, setTempStr] = useState('0.7');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await getSkill(skillId);
      if (s) {
        setSkill(s);
        setName(s.name);
        setDescription(s.description);
        setEmoji(s.emoji);
        setSystemPrompt(s.system_prompt);
        setStarterText(s.starter_text);
        setPlaceholderText(s.placeholder_text);
        setDefaultPersonaId(s.default_persona_id);
        setModelId(s.model_id);
        setTempStr(String(s.temperature ?? 0.7));
      }
      setPersonas(await listPersonas());
    })();
  }, [skillId]);

  const queueSave = (
    next: Partial<
      Pick<
        Skill,
        | 'name'
        | 'description'
        | 'emoji'
        | 'system_prompt'
        | 'starter_text'
        | 'placeholder_text'
        | 'default_persona_id'
        | 'model_id'
        | 'temperature'
      >
    >
  ) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateSkill(skillId, next);
    }, 500);
  };

  const onTempChange = (v: string) => {
    setTempStr(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n >= 0 && n <= 2) {
      queueSave({ temperature: n });
    }
  };

  if (!skill) return null;

  const inputStyle = {
    ...t.type.bodyUser,
    color: t.colors.text.primary,
    borderWidth: 1,
    borderColor: t.colors.border.subtle,
    borderRadius: t.radii.sm,
    padding: t.spacing.sm
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text>
          </Pressable>
        }
        title="skill"
      />
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <View>
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary, marginBottom: t.spacing.xs }}>
              EMOJI
            </Text>
            <TextInput
              value={emoji}
              onChangeText={(v) => {
                setEmoji(v);
                queueSave({ emoji: v });
              }}
              maxLength={2}
              style={{ ...inputStyle, width: 60, textAlign: 'center', fontSize: 18 }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary, marginBottom: t.spacing.xs }}>
              NAME
            </Text>
            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                queueSave({ name: v });
              }}
              style={inputStyle}
            />
          </View>
        </View>

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.md
          }}
        >
          DESCRIPTION
        </Text>
        <TextInput
          value={description}
          onChangeText={(v) => {
            setDescription(v);
            queueSave({ description: v });
          }}
          placeholder="One-line summary"
          placeholderTextColor={t.colors.text.quiet}
          style={inputStyle}
        />

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.md
          }}
        >
          SYSTEM PROMPT
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
          The task-specific instructions appended on top of the persona.
        </Text>
        <TextInput
          value={systemPrompt}
          onChangeText={(v) => {
            setSystemPrompt(v);
            queueSave({ system_prompt: v });
          }}
          multiline
          textAlignVertical="top"
          style={{
            ...inputStyle,
            ...t.type.bodyAi,
            fontSize: 15,
            minHeight: 160
          }}
        />

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.md
          }}
        >
          STARTER TEXT
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
          Prefilled into the composer when the skill is started.
        </Text>
        <TextInput
          value={starterText}
          onChangeText={(v) => {
            setStarterText(v);
            queueSave({ starter_text: v });
          }}
          multiline
          textAlignVertical="top"
          style={{ ...inputStyle, minHeight: 60 }}
        />

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.md
          }}
        >
          PLACEHOLDER
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
          Hint shown in the empty composer.
        </Text>
        <TextInput
          value={placeholderText}
          onChangeText={(v) => {
            setPlaceholderText(v);
            queueSave({ placeholder_text: v });
          }}
          style={inputStyle}
        />

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.md
          }}
        >
          DEFAULT PERSONA
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {personas.map((p) => {
            const selected = defaultPersonaId === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  setDefaultPersonaId(p.id);
                  queueSave({ default_persona_id: p.id });
                }}
                style={{
                  paddingHorizontal: t.spacing.sm,
                  paddingVertical: 5,
                  borderWidth: 1,
                  borderColor: selected
                    ? t.colors.accent.inverse
                    : t.colors.border.default,
                  backgroundColor: selected ? t.colors.bg.subtle : 'transparent',
                  borderRadius: t.radii.sm
                }}
              >
                <Text
                  style={{
                    ...t.type.label,
                    color: selected ? t.colors.text.primary : t.colors.text.secondary
                  }}
                >
                  {p.name.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.md
          }}
        >
          MODEL OVERRIDE
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
          Force this skill to use a specific model regardless of the active default.
          Useful for fast tasks (Compact) or hard ones (Capable).
        </Text>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: t.spacing.sm
          }}
        >
          {[
            { id: null as string | null, label: 'USE ACTIVE' },
            ...CATALOG.map((c) => ({ id: c.id, label: c.tier.toUpperCase() }))
          ].map((opt) => {
            const selected = modelId === opt.id;
            return (
              <Pressable
                key={opt.id ?? 'use-active'}
                onPress={() => {
                  setModelId(opt.id);
                  queueSave({ model_id: opt.id });
                }}
                style={{
                  paddingHorizontal: t.spacing.sm,
                  paddingVertical: 5,
                  borderWidth: 1,
                  borderColor: selected
                    ? t.colors.accent.inverse
                    : t.colors.border.default,
                  backgroundColor: selected ? t.colors.bg.subtle : 'transparent',
                  borderRadius: t.radii.sm
                }}
              >
                <Text
                  style={{
                    ...t.type.label,
                    color: selected ? t.colors.text.primary : t.colors.text.secondary
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.md
          }}
        >
          TEMPERATURE
        </Text>
        <TextInput
          value={tempStr}
          onChangeText={onTempChange}
          keyboardType="decimal-pad"
          style={{ ...inputStyle, width: 100 }}
        />

        {skill.is_builtin === 1 ? (
          <Text
            style={{
              ...t.type.meta,
              color: t.colors.text.tertiary,
              marginTop: t.spacing.md
            }}
          >
            Built-in skill. Edits are saved locally; long-press in the list to duplicate as a
            custom skill instead.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
};
