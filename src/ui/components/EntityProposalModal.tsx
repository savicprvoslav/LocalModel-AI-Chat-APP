import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import type { ProposedFact as ProposedEntity } from '@/rag';

type Props = {
  visible: boolean;
  loading?: boolean;
  proposals: ProposedEntity[];
  /** Called with the subset the user accepted. */
  onAccept: (selected: ProposedEntity[]) => void;
  onCancel: () => void;
};

export const EntityProposalModal = ({
  visible,
  loading,
  proposals,
  onAccept,
  onCancel
}: Props) => {
  const t = useTheme();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (visible) {
      // Default: all selected.
      setSelected(new Set(proposals.map((_, i) => i)));
    }
  }, [visible, proposals]);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const acceptSelected = () => {
    const out = proposals.filter((_, i) => selected.has(i));
    onAccept(out);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
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
          onPress={() => undefined}
          style={{
            backgroundColor: t.colors.bg.elevated,
            borderRadius: t.radii.lg,
            padding: t.spacing.lg,
            borderWidth: 1,
            borderColor: t.colors.border.default,
            maxHeight: '80%'
          }}
        >
          <Text style={{ ...t.type.heading, color: t.colors.text.primary, marginBottom: t.spacing.xs }}>
            Suggested entities
          </Text>
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary, marginBottom: t.spacing.md }}>
            Review what the model picked out. Selected items will be added to the project&apos;s
            entities and prepended to every conversation here.
          </Text>

          {loading ? (
            <View style={{ paddingVertical: t.spacing.xxl, alignItems: 'center', gap: t.spacing.sm }}>
              <ActivityIndicator color={t.colors.text.tertiary} />
              <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>extracting…</Text>
            </View>
          ) : proposals.length === 0 ? (
            <View style={{ paddingVertical: t.spacing.xl }}>
              <Text style={{ ...t.type.bodyAi, color: t.colors.text.secondary }}>
                Nothing new to add. The model didn&apos;t find anything worth pinning beyond what&apos;s
                already in the project.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ marginVertical: t.spacing.sm }}>
              {proposals.map((p, i) => {
                const isOn = selected.has(i);
                return (
                  <Pressable
                    key={`${p.name}-${i}`}
                    onPress={() => toggle(i)}
                    style={{
                      flexDirection: 'row',
                      gap: t.spacing.sm,
                      alignItems: 'flex-start',
                      paddingVertical: t.spacing.sm,
                      borderBottomWidth: 1,
                      borderBottomColor: t.colors.border.subtle
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: t.radii.sm,
                        borderWidth: 1.5,
                        borderColor: isOn ? t.colors.accent.warm : t.colors.border.default,
                        backgroundColor: isOn ? t.colors.accent.warm : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 2
                      }}
                    >
                      {isOn ? (
                        <Text
                          style={{
                            ...t.type.label,
                            color: t.colors.bg.canvas,
                            fontSize: 11,
                            lineHeight: 12
                          }}
                        >
                          ✓
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...t.type.bodyUser, color: t.colors.text.primary }}>
                        {p.name}
                      </Text>
                      <Text
                        style={{
                          ...t.type.bodyAi,
                          color: t.colors.text.secondary,
                          fontSize: 14,
                          marginTop: 2
                        }}
                      >
                        {p.description}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: t.spacing.lg,
              marginTop: t.spacing.lg
            }}
          >
            <Pressable onPress={onCancel} hitSlop={8}>
              <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
                {proposals.length === 0 ? 'CLOSE' : 'CANCEL'}
              </Text>
            </Pressable>
            {proposals.length > 0 ? (
              <Pressable onPress={acceptSelected} hitSlop={8} disabled={selected.size === 0}>
                <Text
                  style={{
                    ...t.type.label,
                    color:
                      selected.size === 0 ? t.colors.text.quiet : t.colors.text.primary
                  }}
                >
                  ADD {selected.size > 0 ? `(${selected.size})` : ''}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
