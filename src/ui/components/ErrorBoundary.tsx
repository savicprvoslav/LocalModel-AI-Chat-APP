import { Component, ErrorInfo, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { darkTokens } from '../theme/tokens';
import { type as typeScale, fonts } from '../theme/typography';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Top-level error boundary. Catches render-time exceptions in any descendant
 * and shows a calm error screen with a Reset button.
 *
 * Uses dark tokens directly (not via useTheme) since the theme provider may
 * itself throw — we want this to render no matter what.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log without sending content. Stack only.
    // eslint-disable-next-line no-console
    console.warn('[ErrorBoundary]', error.message, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: darkTokens.bg.canvas,
          padding: 24,
          paddingTop: 80
        }}
      >
        <Text
          style={{
            ...typeScale.label,
            color: darkTokens.accent.warm,
            marginBottom: 16
          }}
        >
          ✕ SOMETHING BROKE
        </Text>
        <Text
          style={{
            ...typeScale.bodyAi,
            color: darkTokens.text.primary,
            marginBottom: 24
          }}
        >
          The screen crashed. Your data is safe; this is a UI bug.
        </Text>
        <Text
          style={{
            ...typeScale.meta,
            color: darkTokens.text.tertiary,
            fontFamily: fonts.mono,
            marginBottom: 24
          }}
          selectable
        >
          {this.state.error.message}
        </Text>
        <Pressable
          onPress={this.reset}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: darkTokens.accent.inverse,
            borderRadius: 2,
            alignSelf: 'flex-start'
          }}
        >
          <Text
            style={{ ...typeScale.label, color: darkTokens.bg.canvas }}
          >
            RESET
          </Text>
        </Pressable>
      </View>
    );
  }
}
