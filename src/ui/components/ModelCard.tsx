import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { ModelCatalogEntry } from '@/model/catalog';

type Props = {
  entry: ModelCatalogEntry;
  selected?: boolean;
  installed?: boolean;
  active?: boolean;
  recommended?: boolean;
  belowMinRam?: boolean;
  onPress?: () => void;
};

const fmtGB = (bytes: number) => `${(bytes / 1_000_000_000).toFixed(1)} GB`;

export const ModelCard = ({
  entry,
  selected,
  installed,
  active,
  recommended,
  belowMinRam,
  onPress
}: Props) => {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: selected ? t.colors.accent.inverse : t.colors.border.default,
        borderRadius: t.radii.md,
        padding: t.spacing.md,
        marginBottom: t.spacing.sm,
        backgroundColor: selected ? t.colors.bg.subtle : 'transparent',
        opacity: pressed ? 0.85 : belowMinRam ? 0.55 : 1
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: t.spacing.xs
        }}
      >
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
          {entry.tier.toUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.xs }}>
          {recommended ? (
            <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>RECOMMENDED</Text>
          ) : null}
          {active ? (
            <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>● ACTIVE</Text>
          ) : null}
          {installed && !active ? (
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>INSTALLED</Text>
          ) : null}
        </View>
      </View>
      <Text
        style={{
          ...t.type.bodyUser,
          color: t.colors.text.primary,
          marginBottom: t.spacing.xs
        }}
      >
        {entry.displayName}
      </Text>
      <Text
        style={{
          ...t.type.bodyAi,
          color: t.colors.text.secondary,
          fontSize: 14,
          marginBottom: t.spacing.sm
        }}
      >
        {entry.goodFor}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
          {fmtGB(entry.sizeBytes)}
        </Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
          min {entry.minRamGB} GB RAM
        </Text>
      </View>
      {belowMinRam ? (
        <Text
          style={{
            ...t.type.meta,
            color: t.colors.accent.warm,
            marginTop: t.spacing.xs
          }}
        >
          may be slow on this device
        </Text>
      ) : null}
    </Pressable>
  );
};
