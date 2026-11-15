// Mirrors src/Sin.Shared/Contracts.cs in the .NET API.

export type Gender = 'Man' | 'Woman' | 'NonBinary';
export type InterestedIn = 'Men' | 'Women' | 'Everyone';
export type FlawCategory =
  | 'Habits'
  | 'Baggage'
  | 'Hygiene'
  | 'Money'
  | 'Temper'
  | 'Quirks'
  | 'Dealbreaker'
  | 'Other';

export const GENDERS: Gender[] = ['Woman', 'Man', 'NonBinary'];
export const INTERESTS: InterestedIn[] = ['Women', 'Men', 'Everyone'];
export const CATEGORIES: FlawCategory[] = [
  'Habits',
  'Baggage',
  'Hygiene',
  'Money',
  'Temper',
  'Quirks',
  'Dealbreaker',
  'Other',
];

export type ReportReason = 'Harassment' | 'HateSpeech' | 'Spam' | 'FakeProfile' | 'Underage' | 'Inappropriate' | 'Other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'Harassment', label: 'Harassment or threats' },
  { value: 'HateSpeech', label: 'Hate speech' },
  { value: 'Inappropriate', label: 'Inappropriate content' },
  { value: 'FakeProfile', label: 'Fake profile' },
  { value: 'Spam', label: 'Spam or scam' },
  { value: 'Underage', label: 'Seems under 18' },
  { value: 'Other', label: 'Something else' },
];

export const genderLabel = (g: Gender) => (g === 'NonBinary' ? 'Non-binary' : g);

/** Optional and self-described. Never shown on a profile; only used for filtering. */
export type Ethnicity =
  | 'Asian'
  | 'Black'
  | 'HispanicLatino'
  | 'MiddleEastern'
  | 'Multiracial'
  | 'NativeAmerican'
  | 'PacificIslander'
  | 'SouthAsian'
  | 'White'
  | 'Other';

export const ETHNICITIES: Ethnicity[] = [
  'Asian',
  'Black',
  'HispanicLatino',
  'MiddleEastern',
  'Multiracial',
  'NativeAmerican',
  'PacificIslander',
  'SouthAsian',
  'White',
  'Other',
];

const ethnicityLabels: Record<Ethnicity, string> = {
  Asian: 'Asian',
  Black: 'Black',
  HispanicLatino: 'Hispanic / Latino',
  MiddleEastern: 'Middle Eastern',
  Multiracial: 'Multiracial',
  NativeAmerican: 'Native American',
  PacificIslander: 'Pacific Islander',
  SouthAsian: 'South Asian',
  White: 'White',
  Other: 'Other',
};
export const ethnicityLabel = (e: Ethnicity) => ethnicityLabels[e];

/** 67 → 5'7" */
export const formatHeight = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;

export interface AuthResponse {
  token: string;
  userId: string;
  displayName: string;
  needsOnboarding: boolean;
}

export interface Flaw {
  id: string;
  category: FlawCategory;
  text: string;
}

export interface Profile {
  id: string;
  displayName: string;
  age: number;
  gender: Gender;
  interestedIn: InterestedIn;
  headline: string | null;
  photoUrl: string | null;
  flaws: Flaw[];
  heightInches?: number | null;
  /** Only ever present on your own profile. */
  ethnicity?: Ethnicity | null;
  /** How far away this person is. Not present on your own profile. */
  distanceMiles?: number | null;
}

/** Discover filters. A null bound means no limit; an empty ethnicity list means everyone. */
export interface Preferences {
  minAge: number;
  maxAge: number | null;
  maxDistanceMiles: number | null;
  minHeightInches: number | null;
  maxHeightInches: number | null;
  ethnicities: Ethnicity[];
}

export interface SwipeResult {
  isMatch: boolean;
  matchId: string | null;
}

export interface Match {
  matchId: string;
  otherUserId: string;
  otherName: string;
  otherPhotoUrl: string | null;
  lastMessage: string | null;
  matchedAt: string;
}

/** One match in your history. `endedAt` is null while you're still matched. */
export interface MatchHistoryEntry {
  /** Stable key for lists; not a match id. */
  id: string;
  /** Null when that person has since deleted their account. */
  otherName: string | null;
  /** Only for matches that are still going. */
  otherPhotoUrl: string | null;
  matchedAt: string;
  endedAt: string | null;
  /** True if you were the one who unmatched or blocked. */
  endedByMe: boolean;
  /** Only for matches that are still going: opens the chat. */
  matchId: string | null;
  otherUserId: string | null;
}

export interface Message {
  id: number;
  senderId: string;
  text: string;
  sentAt: string;
}

export const LIMITS = {
  maxFlaws: 12,
  flawMax: 280,
  headlineMax: 140,
  messageMax: 1000,
  reportDetailsMax: 1000,
  minHeight: 48,
  maxHeight: 96,
} as const;
