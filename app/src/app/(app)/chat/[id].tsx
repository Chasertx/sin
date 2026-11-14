import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafetySheet } from '@/components/SafetySheet';
import { Avatar, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, shadow, brand } from '@/lib/theme';
import { LIMITS, type Message } from '@/lib/types';

const POLL_MS = 3000;

export default function Chat() {
  const { id, name = 'Match', photo, userId } = useLocalSearchParams<{ id: string; name?: string; photo?: string; userId?: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const lastId = useRef(0);
  const list = useRef<FlatList<Message>>(null);

  const add = useCallback((incoming: Message[]) => {
    const fresh = incoming.filter((m) => m.id > lastId.current);
    if (fresh.length === 0) return;
    lastId.current = Math.max(...fresh.map((m) => m.id));
    setMessages((prev) => [...prev, ...fresh]);
  }, []);

  // Simple polling while the screen is open. Swap for SignalR when you want real-time.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const tick = async () => {
        try {
          add(await api.messages(id, lastId.current));
        } catch {
          // transient; next tick retries
        }
      };
      void tick();
      const timer = setInterval(() => alive && void tick(), POLL_MS);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [id, add]),
  );

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      add([await api.send(id, text)]);
    } catch (e) {
      setDraft(text);
      Alert.alert("Didn't send", e instanceof ApiError ? e.message : String(e));
    }
  };

  const unmatch = () =>
    Alert.alert('Unmatch?', `Turns out ${name}'s problems were too much?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unmatch',
        style: 'destructive',
        onPress: async () => {
          await api.unmatch(id).catch(() => {});
          router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, shadow, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Avatar name={name} uri={photo || null} size={40} />
        <Txt variant="heading" style={{ flex: 1 }}>
          {name}
        </Txt>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Chat options">
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.muted} />
        </Pressable>
      </View>

      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🫣</Text>
            <Txt variant="heading">You matched with {name}</Txt>
            <Txt style={{ color: colors.muted, textAlign: 'center' }}>Ask about their worst problem. It's literally the point.</Txt>
          </View>
        }
        renderItem={({ item }) => {
          const mine = item.senderId === session?.userId;
          const time = new Date(item.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          return mine ? (
            <View style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
              <LinearGradient colors={brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, styles.mine]}>
                <Text style={[styles.bubbleText, { color: colors.white }]}>{item.text}</Text>
              </LinearGradient>
              <Text style={[styles.time, { textAlign: 'right' }]}>{time}</Text>
            </View>
          ) : (
            <View style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
              <View style={[styles.bubble, styles.theirs]}>
                <Text style={styles.bubbleText}>{item.text}</Text>
              </View>
              <Text style={styles.time}>{time}</Text>
            </View>
          );
        }}
      />

      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          style={styles.input}
          placeholder="Say something honest…"
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          maxLength={LIMITS.messageMax}
          returnKeyType="send"
        />
        <Pressable onPress={send} disabled={!draft.trim()} accessibilityRole="button" accessibilityLabel="Send message" style={({ pressed }) => ({ opacity: !draft.trim() ? 0.4 : pressed ? 0.8 : 1 })}>
          <LinearGradient colors={brand} style={styles.send}>
            <Ionicons name="arrow-up" size={22} color={colors.white} />
          </LinearGradient>
        </Pressable>
      </View>

      <SafetySheet
        visible={menuOpen}
        userId={userId}
        name={name}
        onClose={() => setMenuOpen(false)}
        onRemoved={() => {
          setMenuOpen(false);
          router.back();
        }}
        extraActions={[
          {
            label: 'Unmatch',
            icon: 'heart-dislike',
            onPress: () => {
              setMenuOpen(false);
              unmatch();
            },
          },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.surface },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  bubble: { borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 10 },
  mine: { borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 6 },
  bubbleText: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.ink },
  time: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 3, marginHorizontal: 6 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 10, backgroundColor: colors.surface },
  input: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
