import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { ALL_TOOLS, type Tool } from '@/tools';
import { getAllSettings, setSetting, type Settings } from '@/db/settings';
import { SectionHeader } from '../components/SectionHeader';
import { AsciiBlock } from '../components/AsciiBlock';

const isToolEnabled = (tool: Tool, s: Settings): boolean => {
  if (!s.tools_enabled) return false;
  if (tool.id in s.tools_per_tool) return s.tools_per_tool[tool.id] === true;
  return !tool.network;
};

export const ToolsScreen = () => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings | null>(null);

  const reload = useCallback(async () => {
    setSettings(await getAllSettings());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  if (!settings) return null;

  const toggleMaster = async () => {
    const next = !settings.tools_enabled;
    setSettings({ ...settings, tools_enabled: next });
    await setSetting('tools_enabled', next);
  };

  const toggleTool = async (tool: Tool) => {
    if (!settings.tools_enabled) {
      Alert.alert(
        'Tools are off',
        'Turn on the master switch first, then per-tool toggles take effect.'
      );
      return;
    }
    if (tool.network && !isToolEnabled(tool, settings)) {
      Alert.alert(
        'Network tool',
        `${tool.name} sends queries to the public internet. The rest of the app stays local. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: async () => {
              const next = { ...settings.tools_per_tool, [tool.id]: true };
              setSettings({ ...settings, tools_per_tool: next });
              await setSetting('tools_per_tool', next);
            }
          }
        ]
      );
      return;
    }
    const currently = isToolEnabled(tool, settings);
    const next = { ...settings.tools_per_tool, [tool.id]: !currently };
    setSettings({ ...settings, tools_per_tool: next });
    await setSetting('tools_per_tool', next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <View
        style={{
          paddingTop: insets.top + t.spacing.md,
          paddingHorizontal: t.spacing.xl,
          paddingBottom: t.spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border.subtle,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 32,
            height: 32,
            borderWidth: 1,
            borderColor: t.colors.border.default,
            borderRadius: t.radii.sm,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text style={{ fontFamily: t.fonts.mono, fontSize: 14 }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ ...t.type.meta, color: t.colors.accent.warm }}>~/tools</Text>
          <Text style={{ ...t.type.displaySerifLg, color: t.colors.text.primary }}>tools</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.xl }}>
        <SectionHeader
          label="ai tools"
          comment={settings.tools_enabled ? 'enabled · pick which' : 'disabled · master off'}
        />
        <Text
          style={{
            ...t.type.meta,
            color: t.colors.text.quiet,
            marginBottom: t.spacing.md
          }}
        >
          Tools the model can call mid-reply: a calculator for math, a clock for the
          current time, a search across your past chats, and an opt-in web search.
        </Text>

        <Pressable
          onPress={toggleMaster}
          style={{
            marginBottom: t.spacing.lg,
            padding: 14,
            borderWidth: 1,
            borderColor: settings.tools_enabled
              ? t.colors.accent.warm
              : t.colors.border.subtle,
            borderRadius: t.radii.sm
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>
              ENABLE TOOLS
            </Text>
            <View
              style={{
                width: 44,
                height: 26,
                borderRadius: 13,
                borderWidth: 1,
                borderColor: settings.tools_enabled
                  ? t.colors.accent.warm
                  : t.colors.border.default,
                backgroundColor: settings.tools_enabled
                  ? t.colors.accent.warm
                  : 'transparent',
                padding: 2,
                justifyContent: 'center'
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: settings.tools_enabled
                    ? t.colors.bg.canvas
                    : t.colors.text.tertiary,
                  marginLeft: settings.tools_enabled ? 18 : 0
                }}
              />
            </View>
          </View>
          <Text
            style={{ ...t.type.meta, color: t.colors.text.quiet, marginTop: 6 }}
          >
            Adds a tools list to the system prompt and lets the model call them.
          </Text>
        </Pressable>

        {ALL_TOOLS.map((tool) => {
          const enabled = isToolEnabled(tool, settings);
          return (
            <Pressable
              key={tool.id}
              onPress={() => toggleTool(tool)}
              style={{
                marginBottom: t.spacing.sm + 2,
                padding: t.spacing.lg,
                borderWidth: 1,
                borderColor: enabled ? t.colors.text.primary : t.colors.border.default,
                backgroundColor: enabled ? t.colors.bg.subtle : 'transparent',
                borderRadius: t.radii.md
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 6
                }}
              >
                <Text style={{ ...t.type.displaySerif, color: t.colors.text.primary }}>
                  {tool.name}
                </Text>
                <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                  {tool.network ? (
                    <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>
                      NETWORK
                    </Text>
                  ) : (
                    <Text style={{ ...t.type.label, color: t.colors.text.quiet }}>
                      LOCAL
                    </Text>
                  )}
                  <Text
                    style={{
                      ...t.type.label,
                      color: enabled ? t.colors.accent.warm : t.colors.text.quiet
                    }}
                  >
                    {enabled ? '● ON' : '○ OFF'}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  ...t.type.bodyAi,
                  color: t.colors.text.secondary,
                  fontSize: 14,
                  lineHeight: 21
                }}
              >
                {tool.description}
              </Text>
              {tool.params.length > 0 ? (
                <Text
                  style={{
                    fontFamily: t.fonts.mono,
                    fontSize: 11,
                    lineHeight: 16,
                    color: t.colors.text.quiet,
                    marginTop: t.spacing.sm
                  }}
                >
                  {tool.params
                    .map(
                      (p) =>
                        `${p.name}${p.required ? '' : '?'}: ${p.type}`
                    )
                    .join(' · ')}
                </Text>
              ) : null}
            </Pressable>
          );
        })}

        <View style={{ marginTop: t.spacing.lg, alignItems: 'center' }}>
          <AsciiBlock>
            {'  tip: web search hits duckduckgo. nothing else leaves the device.'}
          </AsciiBlock>
        </View>
        <View style={{ height: insets.bottom + t.spacing.xl }} />
      </ScrollView>
    </View>
  );
};
