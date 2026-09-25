// Shared UI primitives for the Paper and Ink design. Screens compose these and
// should rarely need a raw Text or Pressable.
//
// The rules the primitives encode:
// - One serif, Newsreader. Weight comes from a family class
//   (font-serif-medium), never from fontWeight, because Android ignores weight
//   on a custom font.
// - Structure comes from hairline rules and type size, not boxes. There are no
//   cards and no shadows.
// - Ink is the only fill. The accent red marks answers, the active tab and
//   destructive actions.
// - Content sits in one centred column, at most 640 px wide, so the same
//   screens read well on a phone and in a desktop browser.

import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
  type Edge,
} from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { Icon, type IconName } from './Icon';
import { tw } from './tw';

/** Joins class names, dropping empty ones. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** The widest a column of text gets, in px. Wider than this is hard to read. */
export const COLUMN_MAX = 640;
const column = 'w-full max-w-[640px] self-center';

// ---------------------------------------------------------------------------
// Layout

/**
 * A full-window screen padded by the window's safe-area insets, read from the
 * provider rather than measured by a native view.
 *
 * Use it for anything shown as a full-screen modal (session, practice, speed
 * round, summary). A native SafeAreaView measures itself while such a screen
 * is still sliding up from the bottom, finds no overlap with the status bar,
 * and does not measure again, so the header ends up under the Dynamic Island.
 */
export function FullScreen({
  children,
  edges = ['top', 'bottom'],
}: {
  children: React.ReactNode;
  edges?: Edge[];
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 bg-paper"
      style={{
        paddingTop: edges.includes('top') ? insets.top : 0,
        paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {children}
    </View>
  );
}

export function Screen({
  children,
  scroll = false,
  edges = ['top', 'bottom'],
  insets = 'native',
  onRefresh,
  className,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  /**
   * native measures the screen's real overlap with the status bar, which is
   * right for tabs and for a page-sheet modal that never reaches the top.
   * window uses the window's insets, which is right for a full-screen modal
   * (see FullScreen).
   */
  insets?: 'native' | 'window';
  /** Adds pull-to-refresh. Only applies to a scrolling screen. */
  onRefresh?: () => void;
  className?: string;
}) {
  const Frame = insets === 'window' ? FullScreen : NativeFrame;
  return (
    <Frame edges={edges}>
      {scroll ? (
        <ScrollView
          className="flex-1 bg-paper"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={false}
                onRefresh={onRefresh}
                tintColor={colors.ink}
              />
            ) : undefined
          }
        >
          <View className={tw(cx(column, 'px-6 pt-6'), className)}>{children}</View>
        </ScrollView>
      ) : (
        <View className={tw(cx(column, 'flex-1 px-6'), className)}>{children}</View>
      )}
    </Frame>
  );
}

function NativeFrame({ children, edges }: { children: React.ReactNode; edges?: Edge[] }) {
  return (
    <SafeAreaView className="flex-1 bg-paper" edges={edges}>
      {children}
    </SafeAreaView>
  );
}

/** Keeps its children in the centred reading column. */
export function Column({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <View className={tw(cx(column), className)}>{children}</View>;
}

export function Row({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <View className={tw(cx('flex-row items-center'), className)}>{children}</View>;
}

export function Spacer({ h = 12 }: { h?: number }) {
  return <View style={{ height: h }} />;
}

/** A hairline. `strong` draws it in ink, for the top of a section. */
export function Rule({
  strong = false,
  className,
}: {
  strong?: boolean;
  className?: string;
}) {
  return <View className={tw(cx('h-px', strong ? 'bg-ink' : 'bg-rule'), className)} />;
}

export function Divider() {
  return <Rule className="my-6" />;
}

/**
 * A titled block of a screen: an ink rule across the top, a small-caps label,
 * then the content. This is what a card would be in another design.
 */
export function Section({
  label,
  trailing,
  rule = 'ink',
  children,
  className,
}: {
  label?: string;
  /** Right-aligned beside the label: a count, a date range. */
  trailing?: React.ReactNode;
  /** ink for a main section; hairline for an aside inside one. */
  rule?: 'ink' | 'hairline';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={tw(
        cx('border-t pt-3', rule === 'ink' ? 'border-ink' : 'border-rule'),
        className,
      )}
    >
      {label ? (
        <View className="mb-3 flex-row items-baseline justify-between">
          <Label>{label}</Label>
          {typeof trailing === 'string' ? <Label>{trailing}</Label> : trailing}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Type

type TextBits = { children: React.ReactNode; className?: string } & Omit<
  TextProps,
  'children'
>;

/** A screen title. */
export function H1({ children, className, ...rest }: TextBits) {
  return (
    <Text
      className={tw(
        cx('font-serif-medium text-[34px] leading-[40px] tracking-[-0.3px] text-ink'),
        className,
      )}
      {...rest}
    >
      {children}
    </Text>
  );
}

export function H2({ children, className, ...rest }: TextBits) {
  return (
    <Text
      className={tw(
        cx('font-serif-medium text-[24px] leading-[30px] text-ink'),
        className,
      )}
      {...rest}
    >
      {children}
    </Text>
  );
}

/** A word being learned, set large. */
export function Headword({
  children,
  size = 'lg',
  className,
  ...rest
}: TextBits & { size?: 'lg' | 'md' }) {
  return (
    <Text
      className={tw(
        cx(
          'font-serif-medium tracking-[-0.4px] text-ink',
          size === 'lg' ? 'text-[44px] leading-[50px]' : 'text-[34px] leading-[40px]',
        ),
        className,
      )}
      {...rest}
    >
      {children}
    </Text>
  );
}

export function Body({ children, className, ...rest }: TextBits) {
  return (
    <Text
      className={tw(cx('font-serif text-[18px] leading-[26px] text-ink'), className)}
      {...rest}
    >
      {children}
    </Text>
  );
}

/** Secondary text: explanations, counts, captions. */
export function Muted({ children, className, ...rest }: TextBits) {
  return (
    <Text
      className={tw(cx('font-serif text-[16px] leading-[23px] text-graphite'), className)}
      {...rest}
    >
      {children}
    </Text>
  );
}

/** Secondary text set in italic: asides, example sentences, status lines. */
export function Note({ children, className, ...rest }: TextBits) {
  return (
    <Text
      className={tw(
        cx('font-serif-italic text-[16px] leading-[23px] text-graphite'),
        className,
      )}
      {...rest}
    >
      {children}
    </Text>
  );
}

/** Small capitals. Names a section or a number; never carries a sentence. */
export function Label({
  children,
  tone = 'graphite',
  className,
  ...rest
}: TextBits & { tone?: 'graphite' | 'ink' | 'accent' }) {
  return (
    <Text
      className={tw(
        cx(
          'font-serif-medium text-[12px] leading-[16px] uppercase tracking-[1.7px]',
          tone === 'accent'
            ? 'text-accent'
            : tone === 'ink'
              ? 'text-ink'
              : 'text-graphite',
        ),
        className,
      )}
      {...rest}
    >
      {children}
    </Text>
  );
}

/** A number with a small-caps label under it. */
export function Stat({
  value,
  label,
  className,
}: {
  value: string | number;
  label: string;
  className?: string;
}) {
  return (
    <View className={tw(cx('flex-1 gap-1'), className)}>
      <Text className="font-serif-medium text-[34px] leading-[38px] text-ink">
        {value}
      </Text>
      <Label>{label}</Label>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Controls

type ButtonProps = PressableProps & {
  title: string;
  /**
   * primary: ink block, one per screen. secondary: ink outline. ghost: an
   * underlined text link. danger: accent outline, for destructive actions.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** An icon after the title; the title then sits at the left edge. */
  trailingIcon?: IconName;
  loading?: boolean;
  className?: string;
};

export const Button = forwardRef<View, ButtonProps>(function Button(
  { title, variant = 'primary', trailingIcon, loading, disabled, className, ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  const box =
    variant === 'primary'
      ? 'bg-ink active:bg-ink-soft web:hover:bg-ink-soft'
      : variant === 'secondary'
        ? 'border border-ink active:bg-paper-deep web:hover:bg-paper-deep'
        : variant === 'danger'
          ? 'border border-accent active:bg-paper-deep web:hover:bg-paper-deep'
          : 'active:opacity-60 web:hover:opacity-70';
  const textColor =
    variant === 'primary'
      ? 'text-paper'
      : variant === 'danger'
        ? 'text-accent'
        : 'text-ink';
  const iconColor =
    variant === 'primary'
      ? colors.paper
      : variant === 'danger'
        ? colors.accent
        : colors.ink;

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      // The title is also the name, so a button that swaps its text for a
      // spinner while loading still says what it is.
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      className={tw(
        cx(
          'min-h-[52px] flex-row items-center rounded-[3px] px-5',
          trailingIcon ? 'justify-between' : 'justify-center',
          box,
          isDisabled && 'opacity-40',
        ),
        className,
      )}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} accessibilityLabel="Loading" />
      ) : (
        <>
          <Text
            className={cx(
              'font-serif-medium text-[18px] leading-[24px]',
              textColor,
              variant === 'ghost' && 'underline',
            )}
          >
            {title}
          </Text>
          {trailingIcon ? <Icon name={trailingIcon} color={iconColor} /> : null}
        </>
      )}
    </Pressable>
  );
});

/**
 * A full-width row in a list of actions, separated by hairlines. The title is
 * the action; `detail` is an italic aside at the right.
 */
export function ListRow({
  title,
  detail,
  onPress,
  emphasis = false,
  last = false,
  showArrow = false,
  tone = 'ink',
  accessibilityLabel,
}: {
  title: string;
  detail?: string;
  onPress: () => void;
  /** The main action in the list, set in medium weight. */
  emphasis?: boolean;
  /** Draws the closing rule under the final row. */
  last?: boolean;
  showArrow?: boolean;
  /** accent for a destructive action such as deleting the account. */
  tone?: 'ink' | 'accent';
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={cx(
        'min-h-[58px] flex-row items-center justify-between gap-4 border-t border-rule active:bg-paper-deep web:hover:bg-paper-deep',
        last && 'border-b',
      )}
    >
      <Text
        className={cx(
          'flex-shrink text-[21px] leading-[28px]',
          tone === 'accent' ? 'text-accent' : 'text-ink',
          emphasis ? 'font-serif-medium' : 'font-serif',
        )}
      >
        {title}
      </Text>
      {detail ? <Note className="text-[15px]">{detail}</Note> : null}
      {showArrow ? <Icon name="arrow-right" /> : null}
    </Pressable>
  );
}

/** One option in a set: a daily goal, an interest, a reminder time. */
export function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      // Which option is on matters, and fill alone does not reach a screen
      // reader.
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cx(
        'min-h-[44px] justify-center rounded-[3px] border px-4',
        selected
          ? 'border-ink bg-ink'
          : 'border-line active:bg-paper-deep web:hover:bg-paper-deep',
      )}
    >
      <Text
        className={cx(
          'font-serif-medium text-[16px] leading-[22px]',
          selected ? 'text-paper' : 'text-ink',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChoiceGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={tw(cx('flex-row flex-wrap gap-2'), className)}>{children}</View>
  );
}

type TextFieldProps = TextInputProps & {
  /** line: an underline, for single answers. box: a ruled box, for sentences. */
  variant?: 'line' | 'box';
  className?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { variant = 'line', className, ...rest },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.graphite}
      className={tw(
        cx(
          'font-serif text-[20px] text-ink',
          variant === 'line'
            ? 'border-b border-ink py-3'
            : 'min-h-[110px] rounded-[3px] border border-line px-3 py-3 leading-[28px]',
        ),
        className,
      )}
      style={variant === 'box' ? { textAlignVertical: 'top' } : undefined}
      {...rest}
    />
  );
});

/** A 44 px square button holding one icon. The label is for screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  className,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={tw(
        cx(
          'h-11 w-11 items-center justify-center rounded-full active:bg-paper-deep web:hover:bg-paper-deep',
        ),
        className,
      )}
    >
      <Icon name={icon} />
    </Pressable>
  );
}

/** A small underlined action with an optional icon, such as "Hear it". */
export function TextButton({
  label,
  icon,
  onPress,
  accessibilityLabel,
  className,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel?: string;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className={tw(
        cx(
          'min-h-[44px] flex-row items-center gap-2 self-start active:opacity-60 web:hover:opacity-70',
        ),
        className,
      )}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      <Text className="font-serif-medium text-[16px] leading-[22px] text-ink underline">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Progress as a thin line: a hairline track with an ink fill. Three pixels is
 * enough to read at a glance without turning the screen into a dashboard.
 */
export function ProgressBar({
  fraction,
  tone = 'ink',
}: {
  fraction: number;
  tone?: 'ink' | 'accent';
}) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <View className="h-[3px] w-full bg-rule">
      <View
        className={cx('h-[3px]', tone === 'accent' ? 'bg-accent' : 'bg-ink')}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}

export function Spinner({ size = 'small' }: { size?: 'small' | 'large' }) {
  // A spinner renders as a progress bar, which needs a name.
  return (
    <ActivityIndicator color={colors.ink} size={size} accessibilityLabel="Loading" />
  );
}

// ---------------------------------------------------------------------------
// Whole-screen states

/** A full screen with one centred thing on it, such as a spinner. */
export function CenterScreen({ children }: { children: React.ReactNode }) {
  return (
    <FullScreen>
      <View className="flex-1 items-center justify-center">{children}</View>
    </FullScreen>
  );
}

/**
 * A screen with nothing to show and something to do next: an empty
 * collection, a finished queue. Left-aligned like a page of text.
 */
export function EmptyState({
  label,
  title,
  children,
  actions,
}: {
  label?: string;
  title: string;
  /** The explanation, usually one or two sentences. */
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <FullScreen>
      <View className="flex-1 w-full max-w-[480px] self-center justify-center px-6">
        {label ? <Label className="mb-2">{label}</Label> : null}
        <H1>{title}</H1>
        {children ? <View className="mt-3">{children}</View> : null}
        {actions ? <View className="mt-8 gap-3">{actions}</View> : null}
      </View>
    </FullScreen>
  );
}

/**
 * The top bar of a full-screen activity (session, practice, speed round): a
 * close button, something in the middle, and a short status at the right.
 */
export function RunnerHeader({
  closeLabel,
  onClose,
  children,
  status,
}: {
  closeLabel: string;
  onClose: () => void;
  children?: React.ReactNode;
  status?: string;
}) {
  return (
    <View className={cx(column, 'flex-row items-center gap-3 px-4 pt-2')}>
      <IconButton icon="close" label={closeLabel} onPress={onClose} />
      <View className="flex-1">{children}</View>
      {status ? <Note className="min-w-[48px] pr-2 text-right">{status}</Note> : null}
    </View>
  );
}
