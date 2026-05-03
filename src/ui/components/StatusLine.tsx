import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

export type StatusLineState =
  | { kind: 'empty'; project?: string; conv?: string; modelId: string; ctx: number }
  | {
      kind: 'typing';
      project?: string;
      conv?: string;
      modelId: string;
      charCount: number;
    }
  | { kind: 'streaming'; tokenCount: number; tokRate: number; thinking?: boolean }
  | { kind: 'warming' }
  | { kind: 'error'; reason: string }
  | { kind: 'ctxFull' };

const breadcrumb = (project?: string, conv?: string): string => {
  const parts = ['~'];
  if (project) parts.push(project.toLowerCase().replace(/\s+/g, '-'));
  if (conv) parts.push(conv.toLowerCase().replace(/\s+/g, '-').slice(0, 24));
  return parts.join('/');
};

type Props = {
  state: StatusLineState;
  /** Called when the status line is tapped while in `error` state. */
  onRetry?: () => void;
};

export const StatusLine = ({ state, onRetry }: Props) => {
  const t = useTheme();
  let left: string;
  let right: string | null = null;
  let warm = false;

  switch (state.kind) {
    case 'empty':
      left = `${breadcrumb(state.project, state.conv)} · ${state.modelId} · ctx ${state.ctx}`;
      break;
    case 'typing':
      left = `${breadcrumb(state.project, state.conv)} · ${state.modelId}`;
      right = `${state.charCount} chars`;
      break;
    case 'streaming':
      // While the model is inside a `<think>` block, the visible message
      // stays empty — the user needs a signal that something IS happening.
      // Distinct prefix + label so the reasoning phase reads differently
      // from the answer-streaming phase.
      left = state.thinking
        ? `◌ thinking · ${state.tokenCount} tok · ${state.tokRate.toFixed(0)} tok/s`
        : `● generating · ${state.tokenCount} tok · ${state.tokRate.toFixed(0)} tok/s`;
      warm = true;
      break;
    case 'warming':
      left = '◐ warming up…';
      warm = true;
      break;
    case 'error':
      left = `✕ ${state.reason}`;
      right = onRetry ? 'tap to retry' : null;
      warm = true;
      break;
    case 'ctxFull':
      left = '⚠ context full · oldest turn dropped';
      warm = true;
      break;
  }

  const color = warm ? t.colors.accent.warm : t.colors.text.tertiary;
  const isRetryable = state.kind === 'error' && !!onRetry;

  const inner = (
    <View
      style={{
        paddingHorizontal: t.spacing.md,
        paddingTop: t.spacing.sm,
        paddingBottom: t.spacing.xs,
        flexDirection: 'row',
        justifyContent: 'space-between'
      }}
    >
      <Text
        style={{ ...t.type.meta, color, flex: 1, marginRight: t.spacing.sm }}
        numberOfLines={state.kind === 'error' ? undefined : 1}
      >
        {left}
      </Text>
      {right ? (
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>{right}</Text>
      ) : null}
    </View>
  );

  if (isRetryable) {
    return <Pressable onPress={onRetry}>{inner} TEST</Pressable>;
  }
  return inner;
};
