import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { FenceBox } from './FenceBox';

export type WarmingStage = {
  /** Stable id used as React key. */
  key: string;
  /** Description rendered after the glyph (e.g. `mmap weights/Q4_K_M.gguf`). */
  label: string;
  /** State drives the glyph: `pend` → animated spinner, `ok` → `✓`. */
  state: 'pend' | 'ok';
  /** Render only when state === 'ok'; shown right-aligned. */
  ms?: number;
};

type Props = {
  stages: WarmingStage[];
};

const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];
const SPIN_INTERVAL_MS = 150;

/**
 * Code-fence-styled "warming up" terminal log. Each stage starts with a
 * spinning glyph + live "Ns" counter on the active stage; flips to `✓ … 240ms`
 * when the parent toggles its state. The fence-box wraps the whole list with a
 * `warming` lang label floating above the top-left border.
 *
 * The active (first pending) stage shows elapsed seconds since it became
 * active — important for cold loads of large models where the engine sits in
 * one opaque native call for 20–30 s. Without the live counter and animated
 * spinner the user can't tell the app is alive.
 */
export const WarmingLog = ({ stages }: Props) => {
  const t = useTheme();
  const [tick, setTick] = useState(0);

  const firstPendIdx = stages.findIndex((s) => s.state === 'pend');
  const firstPendKey = firstPendIdx >= 0 ? (stages[firstPendIdx]?.key ?? null) : null;

  // Re-anchor the elapsed counter whenever the active stage changes.
  const activeStartRef = useRef<{ key: string | null; at: number }>({
    key: firstPendKey,
    at: Date.now()
  });
  if (activeStartRef.current.key !== firstPendKey) {
    activeStartRef.current = { key: firstPendKey, at: Date.now() };
  }

  useEffect(() => {
    if (firstPendKey === null) return;
    const id = setInterval(() => setTick((n) => n + 1), SPIN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [firstPendKey]);

  if (stages.length === 0) return null;

  const spinner = SPINNER_FRAMES[tick % SPINNER_FRAMES.length];
  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - activeStartRef.current.at) / 1000)
  );

  return (
    <FenceBox lang="warming" paddingV={t.spacing.sm + 2} paddingH={t.spacing.md}>
      <View style={{ gap: 4 }}>
        {stages.map((s) => {
          const ok = s.state === 'ok';
          const isActive = s.key === firstPendKey;
          const right = ok && s.ms !== undefined
            ? `${s.ms}ms`
            : isActive
              ? `${elapsedSec}s`
              : '…';
          return (
            <View
              key={s.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Text
                style={{
                  width: 14,
                  fontFamily: t.fonts.mono,
                  fontSize: 12,
                  color: ok ? t.colors.text.primary : t.colors.accent.warm
                }}
              >
                {ok ? '✓' : spinner}
              </Text>
              <Text
                style={{
                  flex: 1,
                  fontFamily: t.fonts.mono,
                  fontSize: 12,
                  lineHeight: 18,
                  color: ok ? t.colors.text.secondary : t.colors.text.primary
                }}
              >
                {s.label}
              </Text>
              <Text
                style={{
                  fontFamily: t.fonts.mono,
                  fontSize: 11,
                  color: t.colors.text.quiet
                }}
              >
                {right}
              </Text>
            </View>
          );
        })}
      </View>
    </FenceBox>
  );
};
