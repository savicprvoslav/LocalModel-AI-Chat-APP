import { Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { FenceBox } from './FenceBox';

export type WarmingStage = {
  /** Stable id used as React key. */
  key: string;
  /** Description rendered after the glyph (e.g. `mmap weights/Q4_K_M.gguf`). */
  label: string;
  /** State drives the glyph: `pend` → `◐`, `ok` → `✓`. */
  state: 'pend' | 'ok';
  /** Render only when state === 'ok'; shown right-aligned. */
  ms?: number;
};

type Props = {
  stages: WarmingStage[];
};

/**
 * Code-fence-styled "warming up" terminal log. Each stage starts as
 * `◐ <label> …` and flips to `✓ <label> 240ms` when the parent toggles
 * its state. The fence-box wraps the whole list with a `warming` lang
 * label floating above the top-left border.
 *
 * Used in ConversationScreen the moment the engine starts loading a
 * model — turns the dead 5–10 s warmup into a watchable progress feed.
 */
export const WarmingLog = ({ stages }: Props) => {
  const t = useTheme();
  if (stages.length === 0) return null;

  return (
    <FenceBox lang="warming" paddingV={t.spacing.sm + 2} paddingH={t.spacing.md}>
      <View style={{ gap: 4 }}>
        {stages.map((s) => {
          const ok = s.state === 'ok';
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
                {ok ? '✓' : '◐'}
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
                {ok && s.ms !== undefined ? `${s.ms}ms` : '…'}
              </Text>
            </View>
          );
        })}
      </View>
    </FenceBox>
  );
};
