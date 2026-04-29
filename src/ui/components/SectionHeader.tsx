import { Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { AsciiRule } from './AsciiRule';

type Props = {
  /** The section name, lowercased; rendered with a `# ` prefix in mono. */
  label: string;
  /** Optional comment to the right, rendered with a `// ` prefix. */
  comment?: string;
  /** Add extra top padding (use after another section). */
  topPad?: boolean;
};

/**
 * Code-fence section header used in Settings and elsewhere. Renders an
 * ASCII rule, then `# label` on the left and `// comment` on the right.
 * Reads as a comment in a script.
 */
export const SectionHeader = ({ label, comment, topPad }: Props) => {
  const t = useTheme();
  return (
    <View
      style={{
        marginTop: topPad ? t.spacing.xxl - 4 : 0,
        marginBottom: t.spacing.md + 2
      }}
    >
      <AsciiRule width={48} />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 6
        }}
      >
        <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
          {`# ${label.toLowerCase()}`}
        </Text>
        {comment ? (
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
            {`// ${comment}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
};
