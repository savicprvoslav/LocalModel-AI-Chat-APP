import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
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
import { useThemePref } from '../theme/ThemeProvider';
import type { Theme as ThemePref } from '@/db/settings';
import {
  embeddingCoverage,
  listUnembeddedMessageIds,
  upsertEmbedding
} from '@/db/embeddings';
import { hashEmbed, HASH_EMBEDDER_NAME } from '@/chat/vectors';
import { SectionHeader } from '../components/SectionHeader';
import { BigSlider } from '../components/BigSlider';
import { Bar, Ticks } from '../components/Bar';
import { Numeral } from '../components/Numeral';
import { AsciiBlock } from '../components/AsciiBlock';
import { AsciiRule } from '../components/AsciiRule';

const fmtGB1 = (b: number) => `${(b / 1_000_000_000).toFixed(1)}`;

export const SettingsScreen = () => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
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
      let totalDone = 0;
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

  // Storage budget — installed models / total free + used (an approximation;
  // free disk is what FS reports right now, and `used` is models on disk).
  const totalBudget = used + free;
  const usedFraction = totalBudget > 0 ? used / totalBudget : 0;

  // ---- Section: behavior toggle row helper ------------------------------
  const ToggleRow = ({
    label,
    hint,
    value,
    onToggle
  }: {
    label: string;
    hint: string;
    value: boolean;
    onToggle: () => void;
  }) => (
    <Pressable
      onPress={onToggle}
      style={{
        marginTop: t.spacing.sm,
        padding: 14,
        borderWidth: 1,
        borderColor: t.colors.border.subtle,
        borderRadius: t.radii.sm
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6
        }}
      >
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>{label}</Text>
        <View
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            borderWidth: 1,
            borderColor: value ? t.colors.accent.warm : t.colors.border.default,
            backgroundColor: value ? t.colors.accent.warm : 'transparent',
            padding: 2,
            justifyContent: 'center'
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: value ? t.colors.bg.canvas : t.colors.text.tertiary,
              marginLeft: value ? 18 : 0
            }}
          />
        </View>
      </View>
      <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>{hint}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}
      contentContainerStyle={{ paddingBottom: insets.bottom + t.spacing.xl }}
    >
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
        <Text style={{ ...t.type.displaySerifLg, color: t.colors.text.primary }}>settings</Text>
      </View>

      <View style={{ paddingHorizontal: t.spacing.xl, paddingTop: t.spacing.lg }}>
        {/* MODELS */}
        <SectionHeader
          label="models"
          comment={`${Object.values(installed).filter(Boolean).length} installed · ${fmtGB1(used)} / ${fmtGB1(totalBudget)} GB`}
        />
        <View style={{ marginBottom: 4 }}>
          <Bar fraction={usedFraction} />
        </View>
        <Ticks
          labels={[
            '0',
            `${Math.round(totalBudget / 3 / 1_000_000_000)}`,
            `${Math.round((totalBudget * 2) / 3 / 1_000_000_000)}`,
            `${Math.round(totalBudget / 1_000_000_000)} GB`
          ]}
        />
        <View style={{ height: t.spacing.md }} />

        {CATALOG.map((e, i) => {
          const isInstalled = !!installed[e.id];
          const isActive = settings.active_model_id === e.id;
          return (
            <View
              key={e.id}
              style={{
                flexDirection: 'row',
                gap: 14,
                padding: t.spacing.lg,
                borderWidth: 1,
                borderColor: isActive ? t.colors.text.primary : t.colors.border.default,
                backgroundColor: isActive ? t.colors.bg.subtle : 'transparent',
                borderRadius: t.radii.md,
                marginBottom: t.spacing.sm + 2
              }}
            >
              <View style={{ width: 44 }}>
                <Numeral active={isActive}>{i + 1}</Numeral>
              </View>
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 4
                  }}
                >
                  <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
                    {e.tier.toUpperCase()}
                  </Text>
                  {isActive ? (
                    <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>● ACTIVE</Text>
                  ) : isInstalled ? (
                    <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
                      INSTALLED
                    </Text>
                  ) : (
                    <Text style={{ ...t.type.label, color: t.colors.text.quiet }}>
                      NOT INSTALLED
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    ...t.type.displaySerif,
                    color: t.colors.text.primary,
                    marginBottom: t.spacing.sm
                  }}
                >
                  {e.displayName}
                </Text>
                <View style={{ flexDirection: 'row', gap: t.spacing.lg }}>
                  {!isInstalled ? (
                    <Pressable
                      onPress={() => startDownload(e.id)}
                      disabled={downloading !== null}
                    >
                      <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
                        {downloading === e.id ? '▸ DOWNLOADING…' : '↓ DOWNLOAD'}
                      </Text>
                    </Pressable>
                  ) : isActive ? null : (
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
            </View>
          );
        })}

        {/* GENERATION */}
        <SectionHeader label="generation" comment="sampling · output · context" topPad />
        <BigSlider
          label="TEMPERATURE"
          hint="Sampling randomness · 0 deterministic, 2 wild."
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
        <BigSlider
          label="MAX TOKENS"
          hint="Reserved for the reply."
          value={settings.max_tokens}
          min={128}
          max={2048}
          step={128}
          unit="tok"
          onChange={(v) => {
            setSettings({ ...settings, max_tokens: v });
            void setSetting('max_tokens', v);
          }}
        />
        <BigSlider
          label="CONTEXT WINDOW"
          hint="Total tokens the model can see."
          value={settings.context_window}
          min={2048}
          max={8192}
          step={1024}
          unit="tok"
          onChange={(v) => {
            setSettings({ ...settings, context_window: v });
            void setSetting('context_window', v);
          }}
        />

        <ToggleRow
          label="PRE-WARM ON LAUNCH"
          hint="Load the active model on app boot so the first message has no warmup wait. Costs RAM continuously."
          value={settings.prewarm_on_launch}
          onToggle={() => {
            const next = !settings.prewarm_on_launch;
            setSettings({ ...settings, prewarm_on_launch: next });
            void setSetting('prewarm_on_launch', next);
          }}
        />

        {/* BEHAVIOR */}
        <SectionHeader label="behavior" comment="personas · skills · tools · retrieval" topPad />
        <Pressable
          onPress={() => router.push('/personas')}
          style={{
            paddingVertical: t.spacing.md,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: t.colors.border.subtle,
            borderRadius: t.radii.sm,
            marginBottom: t.spacing.sm
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <View>
              <Text style={{ ...t.type.bodyUserV2, color: t.colors.text.primary }}>Personas</Text>
              <Text style={{ ...t.type.meta, color: t.colors.text.quiet, marginTop: 2 }}>
                System prompts you can toggle per chat.
              </Text>
            </View>
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>›</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => router.push('/skills')}
          style={{
            paddingVertical: t.spacing.md,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: t.colors.border.subtle,
            borderRadius: t.radii.sm
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <View>
              <Text style={{ ...t.type.bodyUserV2, color: t.colors.text.primary }}>Skills</Text>
              <Text style={{ ...t.type.meta, color: t.colors.text.quiet, marginTop: 2 }}>
                Slash commands like /eli5 and /summarize.
              </Text>
            </View>
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>›</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => router.push('/tools')}
          style={{
            marginTop: t.spacing.sm,
            paddingVertical: t.spacing.md,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: t.colors.border.subtle,
            borderRadius: t.radii.sm
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <View>
              <Text style={{ ...t.type.bodyUserV2, color: t.colors.text.primary }}>Tools</Text>
              <Text style={{ ...t.type.meta, color: t.colors.text.quiet, marginTop: 2 }}>
                {settings.tools_enabled
                  ? 'Calculator, web search, and more — pick which.'
                  : 'Calculator, web search, and more — disabled.'}
              </Text>
            </View>
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>›</Text>
          </View>
        </Pressable>

        <ToggleRow
          label="ENABLE RETRIEVAL"
          hint="Pull snippets from past chats. Lexical only — paraphrases may miss."
          value={settings.retrieval_enabled}
          onToggle={() => {
            const next = !settings.retrieval_enabled;
            setSettings({ ...settings, retrieval_enabled: next });
            void setSetting('retrieval_enabled', next);
          }}
        />

        <View style={{ marginTop: t.spacing.md }}>
          <BigSlider
            label="MAX SNIPPETS"
            hint="How many snippets to inject when retrieval finds matches."
            value={settings.retrieval_k}
            min={1}
            max={8}
            step={1}
            onChange={(v) => {
              setSettings({ ...settings, retrieval_k: v });
              void setSetting('retrieval_k', v);
            }}
          />
        </View>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary, marginTop: 4 }}>
          {`INDEX COVERAGE: ${coverage.embedded} / ${coverage.total} messages`}
        </Text>
        <Pressable
          onPress={runReindex}
          disabled={reindexing}
          style={{ paddingVertical: t.spacing.sm, opacity: reindexing ? 0.6 : 1 }}
        >
          <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
            {reindexing ? '▸ INDEXING…' : '↻ RE-INDEX MISSING MESSAGES'}
          </Text>
        </Pressable>

        {/* APPEARANCE */}
        <SectionHeader label="appearance" comment="dark is the hero" topPad />
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: t.spacing.md }}>
          {(['system', 'dark', 'light'] as ThemePref[]).map((p) => {
            const selected = themePref === p;
            return (
              <Pressable
                key={p}
                onPress={() => void setThemePref(p)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: selected ? t.colors.text.primary : t.colors.border.default,
                  borderRadius: t.radii.sm,
                  backgroundColor: selected ? t.colors.bg.subtle : 'transparent',
                  alignItems: 'center'
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

        {/* DATA */}
        <SectionHeader label="data" comment="local-only · nothing leaves" topPad />
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
                    Alert.alert('Confirm', 'Are you absolutely sure?', [
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
                    ])
                }
              ]
            )
          }
          style={{ paddingVertical: t.spacing.md }}
        >
          <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>→ WIPE ALL DATA</Text>
        </Pressable>

        {/* Footer */}
        <View style={{ marginTop: t.spacing.xxl, alignItems: 'center', gap: 6 }}>
          <AsciiRule width={32} />
          <AsciiBlock>{`  local chat · v0.1.0
  built for the device in your hand`}</AsciiBlock>
        </View>
      </View>
    </ScrollView>
  );
};
