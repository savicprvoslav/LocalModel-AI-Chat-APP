import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { Project, listProjects } from '@/db/projects';
import { Conversation, listConversations } from '@/db/conversations';
import { getSetting } from '@/db/settings';
import { Bar } from './Bar';
import { AsciiRule } from './AsciiRule';

type Props = {
  visible: boolean;
  onClose: () => void;
  onNewThread: () => void;
};

const DRAWER_WIDTH = Math.min(320, Math.round(Dimensions.get('window').width * 0.84));

const formatRelative = (ts: number): string => {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
};

/**
 * Left-edge sliding drawer with the app's primary navigation.
 *
 * Layout (top → bottom):
 *   1. Brand: chevron glyph + "local chat" + close
 *   2. + NEW THREAD CTA  +  ⌕ search row
 *   3. Section: recents — up to 6 most-recent conversations
 *   4. Section: projects — all projects with conversation counts
 *   5. Section: tools — personas / skills / settings rows
 *   6. Footer: ~ active-model · storage bar
 *
 * Modal-based so it works on top of any screen and the keyboard
 * compresses underneath. Slide-in via Animated translateX, scrim fades.
 */
export const SideMenu = ({ visible, onClose, onNewThread }: Props) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fade = useRef(new Animated.Value(0)).current;

  const [recents, setRecents] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<
    Array<{ project: Project; count: number }>
  >([]);
  const [activeModelId, setActiveModelId] = useState<string>('');

  const reload = useCallback(async () => {
    const [convs, projs] = await Promise.all([listConversations(), listProjects()]);
    setRecents(convs.slice(0, 6));
    const enriched = await Promise.all(
      projs.map(async (p) => {
        const list = convs.filter((c) => c.project_id === p.id);
        return { project: p, count: list.length };
      })
    );
    setProjects(enriched);
    setActiveModelId((await getSetting('active_model_id')) ?? '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  useEffect(() => {
    if (visible) {
      void reload();
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slide, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true
        })
      ]).start();
    }
  }, [visible, slide, fade, reload]);

  const navAndClose = (run: () => void) => () => {
    onClose();
    // Wait for the drawer to slide out so the next screen doesn't fight
    // the close animation.
    setTimeout(run, 150);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Scrim */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0,0,0,0.55)',
          opacity: fade
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: DRAWER_WIDTH,
          backgroundColor: t.colors.bg.canvas,
          borderRightWidth: 1,
          borderRightColor: t.colors.border.default,
          transform: [{ translateX: slide }]
        }}
      >
        {/* Brand header */}
        <View
          style={{
            paddingTop: insets.top + t.spacing.md,
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: t.colors.border.subtle,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: t.colors.accent.inverse,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text
              style={{
                fontFamily: t.fonts.monoBold,
                fontSize: 14,
                color: t.colors.bg.canvas,
                lineHeight: 14
              }}
            >
              {'>'}
            </Text>
          </View>
          <Text
            style={{
              ...t.type.heading,
              color: t.colors.text.primary,
              flex: 1
            }}
          >
            local chat
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={{
              width: 28,
              height: 28,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text style={{ fontFamily: t.fonts.mono, fontSize: 14, color: t.colors.text.tertiary }}>
              ✕
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + t.spacing.xl }}
        >
          {/* Primary actions */}
          <View
            style={{
              paddingHorizontal: t.spacing.lg,
              paddingTop: t.spacing.md,
              paddingBottom: t.spacing.sm,
              gap: t.spacing.sm
            }}
          >
            <Pressable
              onPress={navAndClose(onNewThread)}
              style={{
                paddingVertical: t.spacing.md - 2,
                backgroundColor: t.colors.accent.inverse,
                borderRadius: t.radii.sm,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6
              }}
            >
              <Text style={{ ...t.type.label, color: t.colors.bg.canvas }}>+ NEW THREAD</Text>
            </Pressable>
            <Pressable
              onPress={navAndClose(() => router.push('/search'))}
              style={{
                paddingVertical: t.spacing.sm + 2,
                paddingHorizontal: t.spacing.md,
                borderWidth: 1,
                borderColor: t.colors.border.default,
                borderRadius: t.radii.sm,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Text style={{ fontFamily: t.fonts.mono, fontSize: 14, color: t.colors.text.tertiary }}>
                ⌕
              </Text>
              <Text style={{ ...t.type.bodyUserV2, color: t.colors.text.secondary, flex: 1 }}>
                search every message
              </Text>
            </Pressable>
          </View>

          {/* Recents */}
          <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md }}>
            <SectionLabel label="recents" comment={`${recents.length} thread${recents.length === 1 ? '' : 's'}`} />
            {recents.length === 0 ? (
              <Text
                style={{
                  ...t.type.meta,
                  color: t.colors.text.quiet,
                  paddingVertical: t.spacing.sm
                }}
              >
                ~/no conversations yet
              </Text>
            ) : (
              recents.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={navAndClose(() => router.push(`/conversation/${c.id}`))}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: t.spacing.sm,
                    paddingVertical: t.spacing.sm
                  }}
                >
                  <Text
                    style={{
                      ...t.type.bodyUserV2,
                      color: t.colors.text.primary,
                      flex: 1
                    }}
                    numberOfLines={1}
                  >
                    {c.title}
                  </Text>
                  <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
                    {formatRelative(c.updated_at)}
                  </Text>
                </Pressable>
              ))
            )}
          </View>

          {/* Projects */}
          <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.lg }}>
            <SectionLabel
              label="projects"
              comment={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
            />
            {projects.length === 0 ? (
              <Pressable onPress={navAndClose(() => router.push('/projects'))}>
                <Text
                  style={{
                    ...t.type.meta,
                    color: t.colors.text.quiet,
                    paddingVertical: t.spacing.sm
                  }}
                >
                  + create your first project
                </Text>
              </Pressable>
            ) : (
              <>
                {projects.map(({ project, count }) => (
                  <Pressable
                    key={project.id}
                    onPress={navAndClose(() => router.push(`/project/${project.id}`))}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'baseline',
                      gap: t.spacing.sm,
                      paddingVertical: t.spacing.sm
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: t.fonts.mono,
                        fontSize: 13,
                        color: t.colors.text.tertiary
                      }}
                    >
                      ~/
                    </Text>
                    <Text
                      style={{
                        ...t.type.bodyUserV2,
                        color: t.colors.text.primary,
                        flex: 1
                      }}
                      numberOfLines={1}
                    >
                      {project.name}
                    </Text>
                    <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>
                      {`${count} ${count === 1 ? 'chat' : 'chats'}`}
                    </Text>
                  </Pressable>
                ))}
                <Pressable onPress={navAndClose(() => router.push('/projects'))}>
                  <Text
                    style={{
                      ...t.type.label,
                      color: t.colors.text.tertiary,
                      paddingVertical: t.spacing.sm
                    }}
                  >
                    SEE ALL ›
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Tools */}
          <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.lg }}>
            <SectionLabel label="tools" />
            <ToolRow
              glyph="◎"
              label="Personas"
              hint="System prompts you can switch per chat."
              onPress={navAndClose(() => router.push('/personas'))}
            />
            <ToolRow
              glyph="/"
              label="Skills"
              hint="Slash commands like /eli5."
              onPress={navAndClose(() => router.push('/skills'))}
            />
            <ToolRow
              glyph="⚙"
              label="Settings"
              hint="Models, generation, retrieval, theme."
              onPress={navAndClose(() => router.push('/settings'))}
            />
          </View>
        </ScrollView>

        {/* Footer */}
        <View
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.md,
            paddingBottom: insets.bottom + t.spacing.md,
            borderTopWidth: 1,
            borderTopColor: t.colors.border.subtle,
            gap: t.spacing.xs
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline'
            }}
          >
            <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>
              {`~ ${activeModelId || 'no model'}`}
            </Text>
            <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>active</Text>
          </View>
          <Bar fraction={0.6} />
        </View>
      </Animated.View>
    </Modal>
  );
};

const SectionLabel = ({ label, comment }: { label: string; comment?: string }) => {
  const t = useTheme();
  return (
    <View>
      <AsciiRule width={28} />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 4,
          marginBottom: 6
        }}
      >
        <Text style={{ ...t.type.label, color: t.colors.text.primary }}>
          {`# ${label}`}
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

const ToolRow = ({
  glyph,
  label,
  hint,
  onPress
}: {
  glyph: string;
  label: string;
  hint?: string;
  onPress: () => void;
}) => {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm + 4,
        paddingVertical: t.spacing.sm + 2
      }}
    >
      <Text
        style={{
          fontFamily: t.fonts.mono,
          fontSize: 14,
          color: t.colors.accent.warm,
          width: 16,
          textAlign: 'center'
        }}
      >
        {glyph}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={{ ...t.type.bodyUserV2, color: t.colors.text.primary }}>{label}</Text>
        {hint ? (
          <Text style={{ ...t.type.meta, color: t.colors.text.quiet, marginTop: 2 }}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>›</Text>
    </Pressable>
  );
};
