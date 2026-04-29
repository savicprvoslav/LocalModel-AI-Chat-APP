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
import {
  embeddingCoverage,
  listUnembeddedMessageIds,
  upsertEmbedding
} from '@/db/embeddings';
import { hashEmbed, HASH_EMBEDDER_NAME } from '@/chat/vectors';

const fmtGB = (b: number) => `${(b / 1_000_000_000).toFixed(2)} GB`;

export const SettingsScreen = () => {
  const t = useTheme();
  const { pref: themePref, setPref: setThemePref } = useThemePref();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [used, setUsed] = useState(0);
  const [free, setFree] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<{ embedded: number; total: number }>({
    embedded: 0,
    total: 0
  });
  const [reindexing, setReindexing] = useState(false);

  const refreshCoverage = async () => {
    setCoverage(await embeddingCoverage());
  };

  const reload = async () => {
    const s = await getAllSettings();
    setSettings(s);
    const inst: Record<string, boolean> = {};
    for (const e of CATALOG) inst[e.id] = await modelExists(e.id);
    setInstalled(inst);
    setUsed(await totalModelBytes(Object.keys(inst).filter((k) => inst[k])));
    setFree(await freeDiskBytes());
    await refreshCoverage();
  };

  useEffect(() => {
    void reload();
  }, []);

  const runReindex = async () => {
    setReindexing(true);
    try {
      // Process in chunks of 200 messages so the UI stays responsive on
      // larger histories. Each chunk: pull unembedded ids, embed, upsert.
      let totalDone = 0;
      // Disposable inner loop until no more unembedded messages remain.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await listUnembeddedMessageIds(200);
        if (batch.length === 0) break;
        for (const m of batch) {
          if (!m.content || !m.content.trim()) continue;
          await upsertEmbedding({
            message_id: m.id,
            vector: hashEmbed(m.content),
            embedder: HASH_EMBEDDER_NAME
          });
          totalDone++;
        }
        await refreshCoverage();
      }
      Alert.alert(
        'Re-index complete',
        totalDone === 0
          ? 'Everything was already indexed.'
          : `Embedded ${totalDone} message${totalDone === 1 ? '' : 's'}.`
      );
    } catch (e) {
      Alert.alert('Re-index failed', e instanceof Error ? e.message : String(e));
    } finally {
      setReindexing(false);
    }
  };

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

        <Pressable
          onPress={() => {
            const next = !settings.prewarm_on_launch;
            setSettings({ ...settings, prewarm_on_launch: next });
            void setSetting('prewarm_on_launch', next);
          }}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: t.spacing.md,
            marginTop: t.spacing.sm
          }}
        >
          <View style={{ flex: 1, paddingRight: t.spacing.md }}>
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
              PRE-WARM ON LAUNCH
            </Text>
            <Text style={{ ...t.type.meta, color: t.colors.text.quiet, marginTop: 2 }}>
              Load the active model on app boot so the first message has no warmup wait.
              Costs RAM continuously.
            </Text>
          </View>
          <View
            style={{
              width: 44,
              height: 26,
              borderRadius: 13,
              borderWidth: 1,
              borderColor: settings.prewarm_on_launch
                ? t.colors.accent.warm
                : t.colors.border.default,
              backgroundColor: settings.prewarm_on_launch
                ? t.colors.accent.warm
                : 'transparent',
              padding: 2,
              justifyContent: 'center'
            }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: settings.prewarm_on_launch
                  ? t.colors.bg.canvas
                  : t.colors.text.tertiary,
                marginLeft: settings.prewarm_on_launch ? 18 : 0
              }}
            />
          </View>
        </Pressable>

        <Text
          style={{
            ...t.type.label,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.xl,
            marginBottom: t.spacing.sm
          }}
        >
          RETRIEVAL
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet, marginBottom: t.spacing.sm }}>
          Pull relevant snippets from past conversations into each prompt. Hybrid keyword
          (FTS) + feature-vector retrieval, fully on-device. Honest note: this is lexical, not
          semantic — paraphrase-only queries won't always retrieve.
        </Text>

        <Pressable
          onPress={() => {
            const next = !settings.retrieval_enabled;
            setSettings({ ...settings, retrieval_enabled: next });
            void setSetting('retrieval_enabled', next);
          }}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: t.spacing.md
          }}
        >
          <View style={{ flex: 1, paddingRight: t.spacing.md }}>
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
              ENABLE RETRIEVAL
            </Text>
            <Text style={{ ...t.type.meta, color: t.colors.text.quiet, marginTop: 2 }}>
              Adds a `RELEVANT FROM PAST` block to each prompt when matches are found.
            </Text>
          </View>
          <View
            style={{
              width: 44,
              height: 26,
              borderRadius: 13,
              borderWidth: 1,
              borderColor: settings.retrieval_enabled
                ? t.colors.accent.warm
                : t.colors.border.default,
              backgroundColor: settings.retrieval_enabled
                ? t.colors.accent.warm
                : 'transparent',
              padding: 2,
              justifyContent: 'center'
            }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: settings.retrieval_enabled
                  ? t.colors.bg.canvas
                  : t.colors.text.tertiary,
                marginLeft: settings.retrieval_enabled ? 18 : 0
              }}
            />
          </View>
        </Pressable>

        <StepSlider
          label="MAX SNIPPETS"
          hint="How many snippets to inject. Higher = more context, more tokens consumed."
          value={settings.retrieval_k}
          min={1}
          max={8}
          step={1}
          onChange={(v) => {
            setSettings({ ...settings, retrieval_k: v });
            void setSetting('retrieval_k', v);
          }}
        />

        <Text
          style={{
            ...t.type.meta,
            color: t.colors.text.tertiary,
            marginTop: t.spacing.sm
          }}
        >
          INDEX COVERAGE: {coverage.embedded} / {coverage.total} messages
        </Text>
        <Pressable
          onPress={runReindex}
          disabled={reindexing}
          style={{
            paddingVertical: t.spacing.sm,
            opacity: reindexing ? 0.6 : 1
          }}
        >
          <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
            {reindexing ? 'INDEXING…' : 'RE-INDEX MISSING MESSAGES'}
          </Text>
        </Pressable>

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
