import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = {
  visible: boolean;
  title: string;
  hint?: string;
  initialValue?: string;
  placeholder?: string;
  multiline?: boolean;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

/**
 * Themed cross-platform prompt — replaces Alert.prompt (which is iOS-only).
 * Renders a centered card with input, hint, and submit/cancel actions.
 */
export const PromptModal = ({
  visible,
  title,
  hint,
  initialValue,
  placeholder,
  multiline,
  submitLabel = 'Save',
  onSubmit,
  onCancel
}: Props) => {
  const t = useTheme();
  const [value, setValue] = useState(initialValue ?? '');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setValue(initialValue ?? '');
      // Wait for the modal animation before focusing.
      const id = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(id);
    }
  }, [visible, initialValue]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center',
          paddingHorizontal: t.spacing.lg
        }}
      >
        <Pressable
          // Stop propagation so taps inside the card don't dismiss.
          onPress={() => undefined}
          style={{
            backgroundColor: t.colors.bg.elevated,
            borderRadius: t.radii.lg,
            padding: t.spacing.lg,
            borderWidth: 1,
            borderColor: t.colors.border.default
          }}
        >
          <Text
            style={{
              ...t.type.heading,
              color: t.colors.text.primary,
              marginBottom: hint ? t.spacing.xs : t.spacing.md
            }}
          >
            {title}
          </Text>
          {hint ? (
            <Text
              style={{
                ...t.type.meta,
                color: t.colors.text.tertiary,
                marginBottom: t.spacing.md
              }}
            >
              {hint}
            </Text>
          ) : null}
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={t.colors.text.quiet}
            multiline={multiline}
            textAlignVertical={multiline ? 'top' : 'center'}
            style={{
              ...(multiline ? t.type.bodyAi : t.type.bodyUser),
              color: t.colors.text.primary,
              borderWidth: 1,
              borderColor: t.colors.border.default,
              borderRadius: t.radii.sm,
              padding: t.spacing.sm,
              minHeight: multiline ? 120 : undefined
            }}
            onSubmitEditing={multiline ? undefined : () => onSubmit(value)}
            returnKeyType={multiline ? 'default' : 'done'}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: t.spacing.lg,
              marginTop: t.spacing.lg
            }}
          >
            <Pressable onPress={onCancel} hitSlop={8}>
              <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>CANCEL</Text>
            </Pressable>
            <Pressable onPress={() => onSubmit(value)} hitSlop={8}>
              <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
                {submitLabel.toUpperCase()}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
