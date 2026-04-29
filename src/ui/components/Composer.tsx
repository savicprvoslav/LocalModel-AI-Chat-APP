import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { StatusLineState } from './StatusLine';
import { SlashMenu } from './SlashMenu';
import { hapticImpactLight } from '@/haptics';
import type { Skill } from '@/db/skills';

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
  /** Available skills, used by the inline `/` slash autocomplete. Optional. */
  skills?: Skill[];
  /** Fired when the user picks a skill from the slash menu. The composer has
   *  already stripped the `/word` prefix from the input by the time this runs. */
  onApplySkill?: (skill: Skill) => void;
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
  initialValue,
  skills,
  onApplySkill
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

  // Slash autocomplete — fires only when the message starts with `/` AND
  // we haven't typed past the first whitespace yet. Constrains to the
  // "intent: invoke a skill" case; doesn't try to interpret mid-message
  // slashes (e.g. URLs, file paths) as commands.
  const slashMatch = /^\/(\S*)$/.exec(value);
  const slashActive = !!skills && skills.length > 0 && !!slashMatch && !isStreaming;
  const slashQuery = slashMatch?.[1] ?? '';

  const handleSlashSelect = (skill: Skill) => {
    // Strip the `/word ` prefix so the user's intent ("apply skill") is
    // separated from message content. If they only typed `/cave`, the
    // composer becomes empty and they keep typing.
    const stripped = value.replace(/^\/\S*\s?/, '');
    setValue(stripped);
    onApplySkill?.(skill);
    // Pull focus back to the input so they can keep typing.
    inputRef.current?.focus();
  };

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
      {/* Status line — bare meta, no fence-box decoration. Warm color
          carries the streaming / warming / error states; the idle/typing
          line is quiet tertiary text. */}
      <Pressable
        onPress={isRetryable ? onRetry : undefined}
        disabled={!isRetryable}
        style={{
          paddingHorizontal: t.spacing.md + 2,
          paddingTop: t.spacing.sm + 2,
          paddingBottom: 2,
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: t.spacing.sm
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: t.fonts.mono,
            fontSize: 11,
            lineHeight: 16,
            color: sl.warm ? t.colors.accent.warm : t.colors.text.tertiary,
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
      </Pressable>

      {slashActive && skills ? (
        <SlashMenu
          query={slashQuery}
          skills={skills}
          onSelect={handleSlashSelect}
        />
      ) : null}

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
