import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { SkillDraft } from '@/skills/draftSkill';

type Phase = 'describe' | 'generating' | 'preview' | 'error';

type Props = {
  visible: boolean;
  /** Caller supplies the actual generation; this component just orchestrates UX. */
  onGenerate: (description: string, signal: AbortSignal) => Promise<SkillDraft>;
  onAccept: (draft: SkillDraft) => void;
  onCancel: () => void;
};

/**
 * Two-step skill drafter:
 *   1. user types a one-line description
 *   2. generates → preview card with name / description / system_prompt
 *   3. accept saves the skill, regenerate keeps the description and tries again
 */
export const DraftSkillModal = ({ visible, onGenerate, onAccept, onCancel }: Props) => {
  const t = useTheme();
  const [phase, setPhase] = useState<Phase>('describe');
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (visible) {
      setPhase('describe');
      setDescription('');
      setDraft(null);
      setError(null);
      const id = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(id);
    }
    abortRef.current?.abort();
  }, [visible]);

  const generate = async () => {
    const desc = description.trim();
    if (!desc) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase('generating');
    setError(null);
    try {
      const d = await onGenerate(desc, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setDraft(d);
      setPhase('preview');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Drafting failed.');
      setPhase('error');
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    onCancel();
  };

  const inputStyle = {
    ...t.type.bodyUser,
    color: t.colors.text.primary,
    borderWidth: 1,
    borderColor: t.colors.border.default,
    borderRadius: t.radii.sm,
    padding: t.spacing.sm,
    minHeight: 90
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <Pressable
        onPress={cancel}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center',
          paddingHorizontal: t.spacing.lg
        }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: t.colors.bg.elevated,
            borderRadius: t.radii.lg,
            padding: t.spacing.lg,
            borderWidth: 1,
            borderColor: t.colors.border.default,
            maxHeight: '85%'
          }}
        >
          <Text
            style={{
              ...t.type.heading,
              color: t.colors.text.primary,
              marginBottom: t.spacing.xs
            }}
          >
            Draft a skill
          </Text>
          <Text
            style={{
              ...t.type.meta,
              color: t.colors.text.tertiary,
              marginBottom: t.spacing.md
            }}
          >
            Describe what the skill should do. The active model will draft a
            name, prompt, and persona — you can edit anything after.
          </Text>

          <TextInput
            ref={inputRef}
            value={description}
            onChangeText={setDescription}
            editable={phase === 'describe' || phase === 'error'}
            placeholder='e.g., "critique pitch decks", "translate to formal Japanese"'
            placeholderTextColor={t.colors.text.quiet}
            multiline
            textAlignVertical="top"
            style={inputStyle}
          />

          {phase === 'generating' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.sm,
                marginTop: t.spacing.md
              }}
            >
              <ActivityIndicator color={t.colors.accent.warm} />
              <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
                Drafting…
              </Text>
            </View>
          ) : null}

          {phase === 'error' && error ? (
            <Text
              style={{
                ...t.type.meta,
                color: t.colors.accent.warm,
                marginTop: t.spacing.md
              }}
            >
              {error}
            </Text>
          ) : null}

          {phase === 'preview' && draft ? (
            <ScrollView
              style={{ marginTop: t.spacing.md, maxHeight: 280 }}
              contentContainerStyle={{ gap: t.spacing.sm }}
            >
              <FieldRow label="NAME" value={draft.name} />
              <FieldRow label="DESCRIPTION" value={draft.description} />
              <FieldRow label="SYSTEM PROMPT" value={draft.system_prompt} multiline />
              <FieldRow
                label="PERSONA / TEMP"
                value={`${draft.default_persona_id ?? '(none)'} · ${draft.temperature.toFixed(2)}`}
              />
            </ScrollView>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: t.spacing.lg,
              marginTop: t.spacing.lg,
              flexWrap: 'wrap'
            }}
          >
            <Pressable onPress={cancel} hitSlop={8}>
              <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>CANCEL</Text>
            </Pressable>
            {phase === 'preview' ? (
              <Pressable onPress={() => void generate()} hitSlop={8}>
                <Text style={{ ...t.type.label, color: t.colors.text.secondary }}>
                  TRY AGAIN
                </Text>
              </Pressable>
            ) : null}
            {phase === 'preview' && draft ? (
              <Pressable onPress={() => onAccept(draft)} hitSlop={8}>
                <Text style={{ ...t.type.label, color: t.colors.text.primary }}>SAVE</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void generate()}
                disabled={phase === 'generating' || !description.trim()}
                hitSlop={8}
              >
                <Text
                  style={{
                    ...t.type.label,
                    color:
                      phase === 'generating' || !description.trim()
                        ? t.colors.text.quiet
                        : t.colors.text.primary
                  }}
                >
                  {phase === 'error' ? 'TRY AGAIN' : 'GENERATE'}
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const FieldRow = ({
  label,
  value,
  multiline
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) => {
  const t = useTheme();
  return (
    <View>
      <Text style={{ ...t.type.label, color: t.colors.text.tertiary, marginBottom: 2 }}>
        {label}
      </Text>
      <Text
        style={{
          ...t.type.bodyUser,
          color: t.colors.text.primary,
          fontFamily: multiline ? t.fonts.mono : undefined,
          fontSize: multiline ? 12 : 14,
          lineHeight: multiline ? 18 : 20
        }}
      >
        {value}
      </Text>
    </View>
  );
};
