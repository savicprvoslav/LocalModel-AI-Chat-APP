import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { Persona, getPersona, updatePersona } from '@/db/personas';

type Props = { personaId: string };

export const PersonaEditScreen = ({ personaId }: Props) => {
  const t = useTheme();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tempStr, setTempStr] = useState('0.7');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      const p = await getPersona(personaId);
      if (p) {
        setPersona(p);
        setName(p.name);
        setDescription(p.description);
        setSystemPrompt(p.system_prompt);
        setTempStr(String(p.temperature ?? 0.7));
      }
    })();
  }, [personaId]);

  const queueSave = (
    next: Partial<Pick<Persona, 'name' | 'description' | 'system_prompt' | 'temperature'>>
  ) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updatePersona(personaId, next);
    }, 500);
  };

  const onTempChange = (v: string) => {
    setTempStr(v);
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n >= 0 && n <= 2) {
      queueSave({ temperature: n });
    }
  };

  if (!persona) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text>
          </Pressable>
        }
        title="persona"
      />
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>NAME</Text>
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            queueSave({ name: v });
          }}
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
          DESCRIPTION
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
          One line summary, shown in the picker.
        </Text>
        <TextInput
          value={description}
          onChangeText={(v) => {
            setDescription(v);
            queueSave({ description: v });
          }}
          placeholder="e.g. Sharp prose editor"
          placeholderTextColor={t.colors.text.quiet}
          style={{
            ...t.type.bodyUser,
            color: t.colors.text.primary,
            borderWidth: 1,
            borderColor: t.colors.border.subtle,
            borderRadius: t.radii.sm,
            padding: t.spacing.sm
          }}
        />

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.lg
          }}
        >
          SYSTEM PROMPT
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
          The instructions the assistant follows. Define tone, expertise, and constraints.
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
            ...t.type.bodyAi,
            color: t.colors.text.primary,
            fontSize: 15,
            minHeight: 200,
            padding: t.spacing.md,
            borderWidth: 1,
            borderColor: t.colors.border.subtle,
            borderRadius: t.radii.sm
          }}
        />

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.lg
          }}
        >
          TEMPERATURE
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
          0 = deterministic, 1 = balanced, 2 = wildly creative. Typical 0.3–0.8.
        </Text>
        <TextInput
          value={tempStr}
          onChangeText={onTempChange}
          keyboardType="decimal-pad"
          style={{
            ...t.type.bodyUser,
            color: t.colors.text.primary,
            borderWidth: 1,
            borderColor: t.colors.border.subtle,
            borderRadius: t.radii.sm,
            padding: t.spacing.sm,
            width: 100
          }}
        />

        {persona.is_builtin === 1 ? (
          <Text
            style={{
              ...t.type.meta,
              color: t.colors.text.tertiary,
              marginTop: t.spacing.md
            }}
          >
            Built-in personas can be edited but not deleted. Your changes are saved locally.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
};
