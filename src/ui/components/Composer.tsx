import { useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { StatusLine, StatusLineState } from './StatusLine';
import { hapticImpactLight } from '@/haptics';

type Props = {
  status: StatusLineState;
  disabled?: boolean;
  isStreaming?: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  placeholder?: string;
};

export const Composer = ({
  status,
  disabled,
  isStreaming,
  onSend,
  onStop,
  placeholder = 'message'
}: Props) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState('');

  const liveStatus: StatusLineState =
    isStreaming
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
        backgroundColor: t.colors.bg.canvas
      }}
    >
      <StatusLine state={liveStatus} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: t.spacing.md,
          paddingTop: t.spacing.xs,
          paddingBottom: t.spacing.md + insets.bottom,
          gap: t.spacing.sm
        }}
      >
        <Text
          style={{
            ...t.type.bodyUser,
            color: isStreaming ? t.colors.text.quiet : t.colors.text.tertiary
          }}
        >
          $
        </Text>
        <TextInput
          value={isStreaming ? '' : value}
          onChangeText={setValue}
          placeholder={isStreaming ? '…' : placeholder}
          placeholderTextColor={t.colors.text.quiet}
          editable={!isStreaming && !disabled}
          multiline
          style={{
            flex: 1,
            ...t.type.bodyUser,
            color: t.colors.text.primary,
            opacity: isStreaming ? 0.3 : 1,
            maxHeight: 120,
            paddingVertical: 4
          }}
          onSubmitEditing={send}
          submitBehavior="blurAndSubmit"
          returnKeyType="send"
        />
        {isStreaming ? (
          <Pressable
            onPress={onStop}
            style={{
              paddingHorizontal: t.spacing.sm + 1,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: t.colors.accent.warm,
              borderRadius: t.radii.sm
            }}
          >
            <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>STOP</Text>
          </Pressable>
        ) : (
          <Pressable onPress={send} disabled={value.trim().length === 0 || disabled}>
            <Text
              style={{
                ...t.type.label,
                color:
                  value.trim().length === 0
                    ? t.colors.text.quiet
                    : t.colors.text.primary
              }}
            >
              ↵
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};
