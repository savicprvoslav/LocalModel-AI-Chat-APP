import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import {
  Persona,
  listPersonas,
  setDefaultPersona,
  deletePersona,
  createPersona
} from '@/db/personas';
import { AsciiBlock } from '../components/AsciiBlock';
import { Numeral } from '../components/Numeral';
import { SectionHeader } from '../components/SectionHeader';
import { ActionSheet, ActionSheetItem } from '../components/ActionSheet';

export const PersonasScreen = () => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [sheetFor, setSheetFor] = useState<Persona | null>(null);

  const reload = useCallback(async () => {
    setPersonas(await listPersonas());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const onSetDefault = async (p: Persona) => {
    await setDefaultPersona(p.id);
    await reload();
  };

  const onDelete = (p: Persona) => {
    if (p.is_builtin === 1) {
      Alert.alert(
        'Built-in persona',
        'Built-in personas can be edited but not deleted.'
      );
      return;
    }
    if (p.is_default === 1) {
      Alert.alert('Cannot delete', 'Set another persona as default first.');
      return;
    }
    Alert.alert('Delete persona?', `"${p.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePersona(p.id);
          await reload();
        }
      }
    ]);
  };

  const onNew = async () => {
    const p = await createPersona({
      name: 'New persona',
      description: '',
      system_prompt: 'You are a helpful assistant.',
      temperature: 0.7
    });
    router.push(`/persona/${p.id}`);
  };

  const sheetActions: ActionSheetItem[] = sheetFor
    ? [
        {
          label: sheetFor.is_default === 1 ? 'Already default' : 'Set as default',
          kind: 'warm',
          glyph: sheetFor.is_default === 1 ? '●' : '○',
          disabled: sheetFor.is_default === 1,
          onPress: () => void onSetDefault(sheetFor)
        },
        {
          label: 'Edit',
          glyph: '✎',
          onPress: () => router.push(`/persona/${sheetFor.id}`)
        },
        {
          label: 'Delete',
          kind: 'destructive',
          onPress: () => onDelete(sheetFor)
        }
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      {/* Header */}
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
          <Text style={{ ...t.type.meta, color: t.colors.accent.warm }}>~/personas</Text>
          <Text style={{ ...t.type.displaySerifLg, color: t.colors.text.primary }}>
            personas
          </Text>
        </View>
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
        <SectionHeader
          label="voice"
          comment={`${personas.length} defined · ${personas.filter((p) => p.is_default === 1).length === 1 ? '1 active' : 'none active'}`}
        />
        <Text
          style={{
            ...t.type.meta,
            color: t.colors.text.quiet,
            marginBottom: t.spacing.lg
          }}
        >
          System prompts you can toggle per chat. The default applies unless a conversation
          overrides it.
        </Text>

        {personas.map((p, i) => {
          const isDefault = p.is_default === 1;
          return (
            <Pressable
              key={p.id}
              onPress={() => setSheetFor(p)}
              style={{
                flexDirection: 'row',
                gap: 14,
                padding: t.spacing.lg,
                borderWidth: 1,
                borderColor: isDefault ? t.colors.text.primary : t.colors.border.default,
                backgroundColor: isDefault ? t.colors.bg.subtle : 'transparent',
                borderRadius: t.radii.md,
                marginBottom: t.spacing.sm + 2
              }}
            >
              <View style={{ width: 44 }}>
                <Numeral active={isDefault}>{i + 1}</Numeral>
              </View>
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6
                  }}
                >
                  <Text style={{ ...t.type.displaySerif, color: t.colors.text.primary }}>
                    {p.name}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                    {isDefault ? (
                      <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>
                        ● DEFAULT
                      </Text>
                    ) : null}
                    {p.is_builtin === 1 ? (
                      <Text style={{ ...t.type.label, color: t.colors.text.quiet }}>
                        BUILT-IN
                      </Text>
                    ) : null}
                  </View>
                </View>
                {p.description ? (
                  <Text
                    style={{
                      ...t.type.bodyAi,
                      color: t.colors.text.secondary,
                      fontSize: 14,
                      lineHeight: 21
                    }}
                  >
                    {p.description}
                  </Text>
                ) : null}
                {p.system_prompt ? (
                  <Text
                    style={{
                      fontFamily: t.fonts.mono,
                      fontSize: 11,
                      lineHeight: 16,
                      color: t.colors.text.quiet,
                      marginTop: t.spacing.sm
                    }}
                    numberOfLines={2}
                  >
                    <Text style={{ color: t.colors.text.tertiary }}>{'$ '}</Text>
                    {p.system_prompt}
                  </Text>
                ) : null}
                <Text
                  style={{
                    ...t.type.metaV2,
                    color: t.colors.text.quiet,
                    marginTop: t.spacing.sm
                  }}
                >
                  {`temperature ${(p.temperature ?? 0.7).toFixed(2)}`}
                </Text>
              </View>
            </Pressable>
          );
        })}

        <View style={{ marginTop: t.spacing.lg, alignItems: 'center' }}>
          <AsciiBlock>
            {'  tip: tap a persona to edit, set as default, or delete.'}
          </AsciiBlock>
        </View>
        <View style={{ height: insets.bottom + t.spacing.xl }} />
      </ScrollView>

      <ActionSheet
        visible={sheetFor !== null}
        onClose={() => setSheetFor(null)}
        title={sheetFor ? `~/personas/${sheetFor.name.toLowerCase().replace(/\s+/g, '-')}` : ''}
        subtitle={sheetFor?.name}
        actions={sheetActions}
      />
    </View>
  );
};
