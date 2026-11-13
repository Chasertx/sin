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

export const genderLabel = (g: Gender) => (g === 'NonBinary' ? 'Non-binary' : g);

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
} as const;
