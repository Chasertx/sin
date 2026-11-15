import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { makeStyles, radius, tint, useColors } from '@/lib/theme';
import { LIMITS, REPORT_REASONS, type ReportReason } from '@/lib/types';

export interface SafetyAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  /** The person this is about. */
  userId: string | null | undefined;
  name: string;
  onClose: () => void;
  /** Called once the person has been blocked or reported (reporting also blocks). */
  onRemoved: (how: 'blocked' | 'reported') => void;
  /** Extra rows shown above Block/Report, e.g. Unmatch in a chat. */
  extraActions?: SafetyAction[];
}

/** Bottom sheet with Block and Report. Both app stores require these wherever you can see another person. */
export function SafetySheet({ visible, userId, name, onClose, onRemoved, extraActions = [] }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'menu' | 'report'>('menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setStep('menu');
      setReason(null);
      setDetails('');
      setBusy(false);
    }
  }, [visible]);

  const fail = (e: unknown) => Alert.alert('Hmm', e instanceof ApiError ? e.message : String(e));

  const block = () =>
    Alert.alert(`Block ${name}?`, "You won't see each other again, and any match and messages are removed.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          if (!userId) return;
          try {
            await api.block(userId);
            onRemoved('blocked');
          } catch (e) {
            fail(e);
          }
        },
      },
    ]);

  const submitReport = async () => {
    if (!userId || !reason) return;
    setBusy(true);
    try {
      await api.report(userId, reason, details.trim() || null);
      Alert.alert('Thanks for telling us', `We'll review this. You won't see ${name} again.`);
      onRemoved('reported');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          {step === 'menu' ? (
            <>
              {extraActions.map((a) => (
                <Row key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} />
              ))}
              {userId ? (
                <>
                  <Row icon="ban" label={`Block ${name}`} danger onPress={block} />
                  <Row icon="flag" label={`Report ${name}`} danger onPress={() => setStep('report')} />
                </>
              ) : null}
              <Button title="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: 4 }} />
            </>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
              <Txt variant="heading">Report {name}</Txt>
              <Txt variant="caption">What's going on? Reports are private; {name} won't be told.</Txt>
              {REPORT_REASONS.map((r) => {
                const on = reason === r.value;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setReason(r.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.reason, on && styles.reasonOn]}>
                    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.primary : colors.muted} />
                    <Txt>{r.label}</Txt>
                  </Pressable>
                );
              })}
              <Field
                placeholder="Anything else we should know? (optional)"
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={LIMITS.reportDetailsMax}
              />
              <Button title="Send report" onPress={submitReport} loading={busy} disabled={!reason} />
              <Button title="Back" variant="ghost" onPress={() => setStep('menu')} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const color = danger ? colors.coral : colors.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Txt style={{ color, fontSize: 17 }}>{label}</Txt>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: tint(colors.ink, 0.45) },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingTop: 10, gap: 4, maxHeight: '85%' },
    grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 10, borderRadius: radius.md },
    reason: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.bg },
    reasonOn: { backgroundColor: tint(colors.primary, 0.12) },
  }),
);
