import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  Persona,
  listPersonas,
  setDefaultPersona,
  deletePersona,
  createPersona
} from '@/db/personas';

export const PersonasScreen = () => {
  const t = useTheme();
  const [personas, setPersonas] = useState<Persona[]>([]);

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
    if (p.is_builtin === 1) return;
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

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text>
          </Pressable>
        }
        title="personas"
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
          Personas define who the assistant is. The default persona applies unless a
          conversation overrides it.
        </Text>
        {personas.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => router.push(`/persona/${p.id}`)}
            onLongPress={() => onDelete(p)}
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
                justifyContent: 'space-between',
                marginBottom: t.spacing.xs
              }}
            >
              <Text style={{ ...t.type.bodyUser, color: t.colors.text.primary }}>
                {p.name}
              </Text>
              <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                {p.is_default === 1 ? (
                  <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>
                    ● DEFAULT
                  </Text>
                ) : (
                  <Pressable
                    onPress={() => onSetDefault(p)}
                    hitSlop={8}
                  >
                    <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
                      SET DEFAULT
                    </Text>
                  </Pressable>
                )}
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
                  fontSize: 14
                }}
              >
                {p.description}
              </Text>
            ) : null}
            <Text
              style={{
                ...t.type.meta,
                color: t.colors.text.quiet,
                marginTop: t.spacing.xs
              }}
            >
              temperature {(p.temperature ?? 0.7).toFixed(2)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};
