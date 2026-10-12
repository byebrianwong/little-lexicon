// "Report a problem" under a word: a link that opens, in place, a short form
// asking what looks wrong and for an optional note. It sits on the new-word
// card, the answer reveal and an open row in the browse list.
//
// It opens in place rather than on its own screen so it works inside a
// session, which is already a full-screen modal.

import { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Choice,
  ChoiceGroup,
  Muted,
  Note,
  Row,
  Section,
  TextButton,
  TextField,
} from '@/components/ui';
import { backend } from '@/lib/backend';
import {
  cleanNote,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  type ReportReason,
  type ReportScreen,
} from './reasons';

export type ReportStatus = 'closed' | 'open' | 'sending' | 'sent' | 'error';

/** The form with no state of its own, for stories and for ReportProblem. */
export function ReportProblemView({
  headword,
  status,
  reason,
  note,
  onOpen,
  onCancel,
  onReason,
  onNote,
  onSend,
  className,
}: {
  headword: string;
  status: ReportStatus;
  reason: ReportReason | null;
  note: string;
  onOpen: () => void;
  onCancel: () => void;
  onReason: (reason: ReportReason) => void;
  onNote: (note: string) => void;
  onSend: () => void;
  className?: string;
}) {
  if (status === 'closed') {
    return (
      <View className={className}>
        <TextButton
          label="Report a problem"
          accessibilityLabel={`Report a problem with ${headword}`}
          onPress={onOpen}
        />
      </View>
    );
  }

  if (status === 'sent') {
    return (
      <View className={className}>
        <Note className="py-3">Thanks. We will check this word.</Note>
      </View>
    );
  }

  return (
    <Section label="Report a problem" rule="hairline" className={className}>
      <Muted>{`What looks wrong with ${headword}?`}</Muted>
      <ChoiceGroup className="mt-3">
        {REPORT_REASONS.map((r) => (
          <Choice
            key={r.value}
            label={r.label}
            selected={reason === r.value}
            onPress={() => onReason(r.value)}
          />
        ))}
      </ChoiceGroup>
      <TextField
        variant="box"
        multiline
        value={note}
        onChangeText={onNote}
        maxLength={REPORT_NOTE_MAX}
        placeholder="What should it say? (optional)"
        accessibilityLabel="Details, optional"
        className="mt-4 text-[17px]"
      />
      {status === 'error' ? (
        <Note className="mt-2 text-accent">Could not send the report. Try again.</Note>
      ) : null}
      <Row className="mt-4 gap-3">
        <Button
          title="Send report"
          variant="secondary"
          disabled={reason === null}
          loading={status === 'sending'}
          onPress={onSend}
          className="flex-1"
        />
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
      </Row>
    </Section>
  );
}

export function ReportProblem({
  wordId,
  headword,
  screen,
  className,
}: {
  wordId: number;
  headword: string;
  screen: ReportScreen;
  className?: string;
}) {
  const [status, setStatus] = useState<ReportStatus>('closed');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');

  async function send() {
    if (reason === null || status === 'sending') return;
    setStatus('sending');
    try {
      await backend.reportWord({ wordId, reason, note: cleanNote(note), screen });
      setStatus('sent');
    } catch (err) {
      console.warn(`Report for word ${wordId} failed:`, err);
      setStatus('error');
    }
  }

  return (
    <ReportProblemView
      headword={headword}
      status={status}
      reason={reason}
      note={note}
      onOpen={() => setStatus('open')}
      onCancel={() => {
        setStatus('closed');
        setReason(null);
        setNote('');
      }}
      onReason={setReason}
      onNote={setNote}
      onSend={() => void send()}
      className={className}
    />
  );
}
