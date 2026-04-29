import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { ModelCard } from '../components/ModelCard';
import { CATALOG } from '@/model/catalog';
import {
  modelExists,
  deleteModel as fsDeleteModel,
  totalModelBytes,
  freeDiskBytes
} from '@/model/storage';
import { downloadModel } from '@/model/download';
import { getAllSettings, setSetting, Settings } from '@/db/settings';
import { getEngine } from '@/engine';
import { StepSlider } from '../components/StepSlider';
import { useThemePref } from '../theme/ThemeProvider';
import type { Theme as ThemePref } from '@/db/settings';

const fmtGB = (b: number) => `${(b / 1_000_000_000).toFixed(2)} GB`;

export const SettingsScreen = () => {
  const t = useTheme();
  const { pref: themePref, setPref: setThemePref } = useThemePref();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [used, setUsed] = useState(0);
  const [free, setFree] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);

  const reload = async () => {
    const s = await getAllSettings();
    setSettings(s);
    const inst: Record<string, boolean> = {};
    for (const e of CATALOG) inst[e.id] = await modelExists(e.id);
    setInstalled(inst);
    setUsed(await totalModelBytes(Object.keys(inst).filter((k) => inst[k])));
    setFree(await freeDiskBytes());
  };

  useEffect(() => {
    void reload();
  }, []);

  const setActive = async (id: string) => {
    if (settings?.active_model_id === id) return;
    await getEngine().dispose();
    await setSetting('active_model_id', id);
    setSettings((s) => (s ? { ...s, active_model_id: id } : s));
  };

  const startDownload = async (id: string) => {
    const entry = CATALOG.find((e) => e.id === id);
    if (!entry) return;
    setDownloading(id);
    try {
      await downloadModel(entry, { skipShaCheck: true });
      await reload();
    } catch (e) {
      Alert.alert('Download failed', e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(null);
    }
  };

  const confirmDelete = (id: string) => {
    Alert.alert('Delete model?', 'Frees disk space.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await fsDeleteModel(id);
          await reload();
        }
      }
    ]);
  };

  if (!settings) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text>
          </Pressable>
        }
        title="settings"
      />
      <View style={{ padding: t.spacing.lg }}>
        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginBottom: t.spacing.sm
          }}
        >
          MODELS
        </Text>
        <Text
          style={{
            ...t.type.meta,
            color: t.colors.text.tertiary,
            marginBottom: t.spacing.md
          }}
        >
          using {fmtGB(used)} · {fmtGB(free)} free
        </Text>

        {CATALOG.map((e) => {
          const isInstalled = !!installed[e.id];
          const isActive = settings.active_model_id === e.id;
          return (
            <View key={e.id}>
              <ModelCard entry={e} installed={isInstalled} active={isActive} />
              <View
                style={{
                  flexDirection: 'row',
                  gap: t.spacing.md,
                  marginBottom: t.spacing.lg,
                  marginTop: -t.spacing.xs
                }}
              >
                {!isInstalled ? (
                  <Pressable
                    onPress={() => startDownload(e.id)}
                    disabled={downloading !== null}
                  >
                    <Text
                      style={{
                        ...t.type.label,
                        color:
                          downloading === e.id
                            ? t.colors.text.tertiary
                            : t.colors.text.primary
                      }}
                    >
                      {downloading === e.id ? 'DOWNLOADING…' : 'DOWNLOAD'}
                    </Text>
                  </Pressable>
                ) : isActive ? (
                  <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>● ACTIVE</Text>
                ) : (
                  <>
                    <Pressable onPress={() => setActive(e.id)}>
                      <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
                        SET ACTIVE
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(e.id)}>
                      <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>
                        DELETE
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          );
        })}

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.xl,
            marginBottom: t.spacing.sm
          }}
        >
          BEHAVIOR
        </Text>
        <Pressable
          onPress={() => router.push('/personas')}
          style={{
            paddingVertical: t.spacing.sm,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <Text style={{ ...t.type.bodyUser, color: t.colors.text.primary }}>Personas</Text>
          <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>›</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/skills')}
          style={{
            paddingVertical: t.spacing.sm,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <Text style={{ ...t.type.bodyUser, color: t.colors.text.primary }}>Skills</Text>
          <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>›</Text>
        </Pressable>

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.xl,
            marginBottom: t.spacing.md
          }}
        >
          GENERATION
        </Text>
        <StepSlider
          label="TEMPERATURE"
          hint="Sampling randomness. 0 = deterministic, 1 = balanced, 2 = wild. Personas can override per-conversation."
          value={settings.temperature}
          min={0}
          max={2}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => {
            const rounded = +v.toFixed(2);
            setSettings({ ...settings, temperature: rounded });
            void setSetting('temperature', rounded);
          }}
        />
        <StepSlider
          label="MAX RESPONSE TOKENS"
          hint="Reserved for the model's reply. Larger = longer answers but smaller context for history."
          value={settings.max_tokens}
          min={128}
          max={2048}
          step={128}
          onChange={(v) => {
            setSettings({ ...settings, max_tokens: v });
            void setSetting('max_tokens', v);
          }}
        />
        <StepSlider
          label="CONTEXT WINDOW"
          hint="Total tokens the model can see. Bigger uses more memory; below ~2k may truncate history aggressively."
          value={settings.context_window}
          min={2048}
          max={8192}
          step={1024}
          onChange={(v) => {
            setSettings({ ...settings, context_window: v });
            void setSetting('context_window', v);
          }}
        />

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.xl,
            marginBottom: t.spacing.sm
          }}
        >
          APPEARANCE
        </Text>
        <Text
          style={{
            ...t.type.meta,
            color: t.colors.text.quiet,
            marginBottom: t.spacing.sm
          }}
        >
          Dark is the hero treatment; light adapts. System follows your phone setting.
        </Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginBottom: t.spacing.md }}>
          {(['system', 'dark', 'light'] as ThemePref[]).map((p) => {
            const selected = themePref === p;
            return (
              <Pressable
                key={p}
                onPress={() => void setThemePref(p)}
                style={{
                  paddingHorizontal: t.spacing.md,
                  paddingVertical: t.spacing.sm,
                  borderWidth: 1,
                  borderColor: selected ? t.colors.accent.inverse : t.colors.border.default,
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
                  {p.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.xl,
            marginBottom: t.spacing.sm
          }}
        >
          DATA
        </Text>
        <Pressable
          onPress={() =>
            Alert.alert(
              'Wipe all data?',
              'Deletes settings and all installed models.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Wipe',
                  style: 'destructive',
                  onPress: () =>
                    Alert.alert(
                      'Confirm',
                      'Are you absolutely sure?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Wipe everything',
                          style: 'destructive',
                          onPress: async () => {
                            for (const e of CATALOG) await fsDeleteModel(e.id);
                            await setSetting('active_model_id', null);
                            router.replace('/first-run');
                          }
                        }
                      ]
                    )
                }
              ]
            )
          }
        >
          <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>WIPE ALL DATA</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};
