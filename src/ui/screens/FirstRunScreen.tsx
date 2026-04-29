import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { CATALOG, DEFAULT_MODEL_ID, ModelCatalogEntry } from '@/model/catalog';
import { downloadModel } from '@/model/download';
import { setSetting } from '@/db/settings';
import { getDeviceRamGB } from '@/device';
import { listConversations, createConversation } from '@/db/conversations';
import { appendMessage } from '@/db/messages';
import { getDefaultPersona } from '@/db/personas';
import { AsciiBlock } from '../components/AsciiBlock';
import { DotPulse } from '../components/DotPulse';
import { Bar, Ticks } from '../components/Bar';
import { Numeral } from '../components/Numeral';

type Props = { onComplete: () => void; deviceRamGB?: number };

const fmtGB = (b: number): string => `${(b / 1_000_000_000).toFixed(1)} GB`;

const BANNER = `  _                 _    ___ _           _
 | |   ___  __ __ _| |  / __| |_  __ _ _| |_
 | |__/ _ \\/ _/ _\` | | | (__| ' \\/ _\` |_   _|
 |____\\___/\\__\\__,_|_|  \\___|_||_\\__,_| |_|`;

export const FirstRunScreen = ({ onComplete, deviceRamGB }: Props) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string>(DEFAULT_MODEL_ID);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detectedRamGB, setDetectedRamGB] = useState<number | null>(
    typeof deviceRamGB === 'number' ? deviceRamGB : null
  );

  useEffect(() => {
    if (typeof deviceRamGB === 'number') return;
    void (async () => {
      setDetectedRamGB(await getDeviceRamGB());
    })();
  }, [deviceRamGB]);

  const ramGB = detectedRamGB ?? 8;
  const entry: ModelCatalogEntry = CATALOG.find((e) => e.id === selected) ?? CATALOG[1]!;

  const seedWelcomeIfFirstRun = async (): Promise<void> => {
    const existing = await listConversations();
    if (existing.length > 0) return;
    const persona = await getDefaultPersona();
    const conv = await createConversation({
      title: 'Welcome',
      ...(persona ? { persona_id: persona.id } : {})
    });
    await appendMessage({
      conversation_id: conv.id,
      role: 'assistant',
      content: [
        "**You're set.** This chat runs entirely on your device — no cloud, no account.",
        '',
        'A few things to try:',
        '- Tap a **skill chip** above to start a task-shaped conversation',
        '- Tap **+ NEW THREAD** for a blank chat',
        '- Open **Settings** to switch personas, edit skills, or change the model',
        '- Long-press any conversation to rename, move, or delete it',
        '',
        'Send any message to get started.'
      ].join('\n')
    });
  };

  const start = async () => {
    setError(null);
    setDownloading(true);
    setProgress(0);
    try {
      await downloadModel(entry, {
        onProgress: setProgress,
        skipShaCheck: true
      });
      await setSetting('active_model_id', entry.id);
      await seedWelcomeIfFirstRun();
      onComplete();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + t.spacing.lg,
        paddingBottom: insets.bottom + t.spacing.xl,
        backgroundColor: t.colors.bg.canvas,
        flexGrow: 1
      }}
    >
      {/* ASCII banner */}
      <View style={{ paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.md }}>
        <AsciiBlock>{BANNER}</AsciiBlock>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            marginTop: t.spacing.sm
          }}
        >
          <DotPulse />
          <Text style={{ ...t.type.meta, color: t.colors.accent.warm }}>
            ~/init.sh · pick a model to begin
          </Text>
        </View>
      </View>

      {/* Editorial pitch */}
      <View
        style={{
          paddingHorizontal: t.spacing.xl,
          paddingTop: t.spacing.sm,
          paddingBottom: t.spacing.lg
        }}
      >
        <Text
          style={{
            ...t.type.displaySerifLg,
            color: t.colors.text.primary,
            marginBottom: t.spacing.sm
          }}
        >
          A private chat that runs{' '}
          <Text
            style={{
              fontFamily: t.fonts.serifItalic,
              fontStyle: 'italic',
              color: t.colors.accent.warm
            }}
          >
            entirely
          </Text>{' '}
          on your phone.
        </Text>
        <Text
          style={{
            ...t.type.bodyAi,
            color: t.colors.text.secondary,
            fontSize: 14,
            lineHeight: 22
          }}
        >
          No account. No cloud. Your prompts never leave the device. Pick a model below — you
          can install more later.
        </Text>
      </View>

      {/* Section header */}
      <View
        style={{
          paddingHorizontal: t.spacing.xl,
          paddingBottom: t.spacing.sm,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline'
        }}
      >
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>$ ls models/</Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
          {`${CATALOG.length} available`}
        </Text>
      </View>

      {/* Model cards */}
      <View style={{ paddingHorizontal: t.spacing.xl }}>
        {CATALOG.map((e, i) => {
          const isSelected = selected === e.id;
          const ramFraction = Math.min(1, e.minRamGB / Math.max(ramGB, 0.0001));
          const belowMin = e.minRamGB > ramGB;
          return (
            <Pressable
              key={e.id}
              disabled={downloading}
              onPress={() => setSelected(e.id)}
              style={{
                flexDirection: 'row',
                gap: 14,
                padding: t.spacing.lg,
                borderWidth: 1,
                borderColor: isSelected ? t.colors.text.primary : t.colors.border.default,
                backgroundColor: isSelected ? t.colors.bg.subtle : 'transparent',
                borderRadius: t.radii.md,
                marginBottom: t.spacing.sm + 2,
                opacity: downloading ? 0.7 : 1
              }}
            >
              <View style={{ width: 44 }}>
                <Numeral active={isSelected}>{i + 1}</Numeral>
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
                  {e.id === DEFAULT_MODEL_ID ? (
                    <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>
                      ★ RECOMMENDED
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={{
                    ...t.type.displaySerif,
                    color: t.colors.text.primary,
                    marginBottom: 4
                  }}
                >
                  {e.displayName}
                </Text>
                <Text
                  style={{
                    ...t.type.bodyAi,
                    color: t.colors.text.secondary,
                    fontSize: 13,
                    lineHeight: 19,
                    marginBottom: t.spacing.sm + 2
                  }}
                >
                  {e.goodFor}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginBottom: 4
                  }}
                >
                  <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
                    {`disk · ${fmtGB(e.sizeBytes)}`}
                  </Text>
                  <Text
                    style={{
                      ...t.type.meta,
                      color: belowMin ? t.colors.accent.warm : t.colors.text.tertiary
                    }}
                  >
                    {`ram · ${e.minRamGB} GB min`}
                  </Text>
                </View>
                <Bar fraction={ramFraction} warm={belowMin} />
                <Ticks
                  labels={[
                    '0',
                    `${Math.round(ramGB / 3)}`,
                    `${Math.round((ramGB * 2) / 3)}`,
                    `${ramGB} GB`
                  ]}
                />
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* CTA */}
      <View
        style={{
          paddingHorizontal: t.spacing.xl,
          paddingTop: t.spacing.lg,
          paddingBottom: t.spacing.lg
        }}
      >
        <Pressable
          onPress={start}
          disabled={downloading}
          style={{
            position: 'relative',
            overflow: 'hidden',
            paddingVertical: t.spacing.lg - 2,
            backgroundColor: t.colors.accent.inverse,
            borderRadius: t.radii.sm,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* Progress fill animates inside the button while downloading */}
          {downloading ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: t.colors.accent.warm
              }}
            />
          ) : null}
          <Text style={{ ...t.type.label, color: t.colors.bg.canvas }}>
            {downloading
              ? `▸ DOWNLOADING ${Math.round(progress * 100)}% · ${fmtGB(entry.sizeBytes * progress)} / ${fmtGB(entry.sizeBytes)}`
              : `↓ INSTALL ${entry.displayName.toUpperCase()}`}
          </Text>
        </Pressable>

        {error ? (
          <Text style={{ ...t.type.meta, color: t.colors.accent.warm, marginTop: t.spacing.md }}>
            ✕ {error}
          </Text>
        ) : null}

        <View style={{ marginTop: t.spacing.lg, gap: 6 }}>
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
            → runs on your device
          </Text>
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
            → no account, no cloud
          </Text>
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
            → install more models later
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};
