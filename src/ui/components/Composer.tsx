import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { StatusLineState } from './StatusLine';
import { FenceBox } from './FenceBox';
import { hapticImpactLight } from '@/haptics';

type Props = {
  status: StatusLineState;
  disabled?: boolean;
  isStreaming?: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  onRetry?: () => void;
  placeholder?: string;
  /** Initial text to seed the composer (e.g., from a skill's starter_text). */
  initialValue?: string;
};

/**
 * Format the live status as a single-line code-fence body. Mirrors the
 * V2 design — model id + ctx + char count when idle, generation telemetry
 * when streaming, warm-accent icon for warming/error/ctxFull.
 */
const renderStatusLine = (
  state: StatusLineState,
  charCount: number,
  ctxModelId: string,
  ctxLen: number
): { left: string; lang: string; warm: boolean; right: string | null } => {
  switch (state.kind) {
    case 'empty':
      return {
        left: `~ ${state.modelId} · ctx ${state.ctx} · ${charCount} chars`,
        lang: 'ready',
        warm: false,
        right: null
      };
    case 'typing':
      return {
        left: `~ ${state.modelId} · ${state.charCount} chars`,
        lang: 'ready',
        warm: false,
        right: null
      };
    case 'streaming':
      return {
        left: `● generating · ${state.tokenCount} tok · ${state.tokRate.toFixed(0)} tok/s`,
        lang: 'streaming',
        warm: true,
        right: null
      };
    case 'warming':
      return { left: '◐ warming up the model', lang: 'warming', warm: true, right: null };
    case 'error':
      return {
        left: `✕ ${state.reason}`,
        lang: 'error',
        warm: true,
        right: 'tap to retry'
      };
    case 'ctxFull':
      return {
        left: '⚠ context full · oldest turn dropped',
        lang: 'ctx-full',
        warm: true,
        right: null
      };
    default: {
      // Defensive fallback (shouldn't be reached due to exhaustive switch).
      const _: never = state;
      void _;
      return {
        left: `~ ${ctxModelId} · ctx ${ctxLen}`,
        lang: 'ready',
        warm: false,
        right: null
      };
    }
  }
};

export const Composer = ({
  status,
  disabled,
  isStreaming,
  onSend,
  onStop,
  onRetry,
  placeholder = 'message',
  initialValue
}: Props) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialValue ?? '');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (initialValue && initialValue.length > 0) {
      setValue(initialValue);
    }
    const id = setTimeout(() => {
      inputRef.current?.focus();
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-update the typing state with the current character count.
  const liveStatus: StatusLineState = isStreaming
    ? status
    : value.length > 0 && status.kind === 'empty'
      ? {
          kind: 'typing',
          project: status.project,
          conv: status.conv,
          modelId: status.modelId,
          charCount: value.length
        }
      : status;

  const ctxModelId = status.kind === 'empty' || status.kind === 'typing' ? status.modelId : '';
  const ctxLen = status.kind === 'empty' ? status.ctx : 0;
  const sl = renderStatusLine(liveStatus, value.length, ctxModelId, ctxLen);
  const isRetryable = liveStatus.kind === 'error' && !!onRetry;

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    hapticImpactLight();
    onSend(trimmed);
    setValue('');
    Keyboard.dismiss();
  };

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: t.colors.border.subtle,
        backgroundColor: t.colors.bg.canvas,
        paddingBottom: insets.bottom + t.spacing.sm
      }}
    >
      {/* Fence-box status line — flips to warm border while streaming/erroring */}
      <View style={{ paddingHorizontal: t.spacing.md, paddingTop: t.spacing.md + 4 }}>
        <Pressable
          onPress={isRetryable ? onRetry : undefined}
          disabled={!isRetryable}
        >
          <FenceBox
            lang={sl.lang}
            borderColor={sl.warm ? t.colors.accent.warm : t.colors.border.default}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between'
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: t.fonts.mono,
                  fontSize: 12,
                  lineHeight: 18,
                  color: sl.warm ? t.colors.accent.warm : t.colors.text.secondary,
                  flex: 1
                }}
              >
                {sl.left}
              </Text>
              {sl.right ? (
                <Text
                  style={{
                    fontFamily: t.fonts.mono,
                    fontSize: 11,
                    color: t.colors.text.tertiary
                  }}
                >
                  {sl.right}
                </Text>
              ) : null}
            </View>
          </FenceBox>
        </Pressable>
      </View>

      {/* Composer row: $ prompt — textarea — STOP / send arrow */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: t.spacing.sm,
          paddingHorizontal: t.spacing.md,
          paddingTop: t.spacing.sm + 2,
          paddingBottom: 4
        }}
      >
        <Text
          style={{
            fontFamily: t.fonts.mono,
            fontSize: 14,
            color: isStreaming ? t.colors.text.quiet : t.colors.text.tertiary,
            paddingTop: 8
          }}
        >
          $
        </Text>
        <TextInput
          ref={inputRef}
          value={isStreaming ? '' : value}
          onChangeText={setValue}
          placeholder={isStreaming ? '…' : placeholder}
          placeholderTextColor={t.colors.text.quiet}
          editable={!isStreaming && !disabled}
          multiline
          style={{
            flex: 1,
            fontFamily: t.fonts.mono,
            fontSize: 14,
            lineHeight: 22,
            color: t.colors.text.primary,
            opacity: isStreaming ? 0.3 : 1,
            maxHeight: 120,
            paddingVertical: 7
          }}
          onSubmitEditing={send}
          submitBehavior="blurAndSubmit"
          returnKeyType="send"
        />
        {isStreaming ? (
          <Pressable
            onPress={onStop}
            style={{
              width: 36,
              height: 36,
              borderRadius: t.radii.sm,
              backgroundColor: t.colors.accent.warm,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {/* Stop = filled square glyph */}
            <View
              style={{
                width: 12,
                height: 12,
                backgroundColor: t.colors.bg.canvas
              }}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={send}
            disabled={value.trim().length === 0 || disabled}
            style={{
              width: 36,
              height: 36,
              borderRadius: t.radii.sm,
              backgroundColor: t.colors.accent.inverse,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: value.trim().length === 0 ? 0.3 : 1
            }}
          >
            <Text
              style={{
                fontFamily: t.fonts.monoBold,
                fontSize: 16,
                color: t.colors.bg.canvas,
                lineHeight: 16
              }}
            >
              ↑
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};
