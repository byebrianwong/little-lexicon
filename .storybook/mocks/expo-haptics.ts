// Stands in for expo-haptics inside Storybook.
//
// The real package's entry point is expo-modules-core, which ships TypeScript
// source and re-exports types as values; Vite cannot transform that, and the
// story fails to load. Nothing is lost: feedback.ts already returns early on
// web, so haptics never fire in a browser anyway.

export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}

export async function notificationAsync(_type: NotificationFeedbackType): Promise<void> {}

export async function impactAsync(_style?: ImpactFeedbackStyle): Promise<void> {}

export async function selectionAsync(): Promise<void> {}
