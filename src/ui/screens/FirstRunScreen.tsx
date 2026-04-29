import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { ModelCard } from '../components/ModelCard';
import { CATALOG, DEFAULT_MODEL_ID } from '@/model/catalog';
import { downloadModel } from '@/model/download';
import { setSetting } from '@/db/settings';
import { getDeviceRamGB } from '@/device';
import { listConversations, createConversation } from '@/db/conversations';
import { appendMessage } from '@/db/messages';
import { getDefaultPersona } from '@/db/personas';

type Props = { onComplete: () => void; deviceRamGB?: number };

const fmtGB = (b: number) => `${(b / 1_000_000_000).toFixed(1)} GB`;

export const FirstRunScreen = ({ onComplete, deviceRamGB }: Props) => {
  const t = useTheme();
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

  const entry = CATALOG.find((e) => e.id === selected) ?? CATALOG[1]!;

  const seedWelcomeIfFirstRun = async (): Promise<void> => {
    // Only seed if there are no conversations yet (true first run, not a re-download).
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
        '**You\'re set.** This chat runs entirely on your device — no cloud, no account.',
        '',
        'A few things to try:',
        '- Tap a **skill chip** above to start a task-shaped conversation',
        '- Tap **+ NEW** for a blank chat',
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
        padding: t.spacing.xl,
        paddingTop: t.spacing.xxl + t.spacing.lg,
        backgroundColor: t.colors.bg.canvas,
        flexGrow: 1
      }}
    >
      <Text
        style={{ ...t.type.heading, color: t.colors.text.primary, marginBottom: t.spacing.xs }}
      >
        local chat
      </Text>
      <Text
        style={{
          ...t.type.bodyAi,
          color: t.colors.text.secondary,
          fontSize: 15,
          marginBottom: t.spacing.xl
        }}
      >
        A private chat that runs on your device. No account, no cloud. Pick a model to download —
        you can install more later.
      </Text>

      {CATALOG.map((e) => (
        <ModelCard
          key={e.id}
          entry={e}
          selected={selected === e.id}
          recommended={e.id === DEFAULT_MODEL_ID}
          belowMinRam={ramGB < e.minRamGB}
          onPress={() => !downloading && setSelected(e.id)}
        />
      ))}

      {error ? (
        <Text
          style={{
            ...t.type.meta,
            color: t.colors.accent.warm,
            marginTop: t.spacing.md
          }}
        >
          ✕ {error}
        </Text>
      ) : null}

      <Pressable
        onPress={start}
        disabled={downloading}
        style={{
          marginTop: t.spacing.lg,
          paddingVertical: t.spacing.md,
          backgroundColor: t.colors.accent.inverse,
          borderRadius: t.radii.sm,
          alignItems: 'center',
          opacity: downloading ? 0.7 : 1
        }}
      >
        {downloading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <ActivityIndicator color={t.colors.bg.canvas} />
            <Text style={{ ...t.type.label, color: t.colors.bg.canvas }}>
              DOWNLOADING {Math.round(progress * 100)}%
            </Text>
          </View>
        ) : (
          <Text style={{ ...t.type.label, color: t.colors.bg.canvas }}>
            DOWNLOAD {entry.displayName.toUpperCase()}  {fmtGB(entry.sizeBytes)}
          </Text>
        )}
      </Pressable>

      <View style={{ marginTop: t.spacing.lg, gap: t.spacing.xs }}>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
          · runs on your device
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
          · no account, no cloud
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
          · you can install more models later
        </Text>
      </View>
    </ScrollView>
  );
};
