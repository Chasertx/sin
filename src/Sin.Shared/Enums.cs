namespace Sin.Shared;

public enum Gender { Man, Woman, NonBinary }

public enum InterestedIn { Men, Women, Everyone }

public enum ReportReason
{
    Harassment,
    HateSpeech,
    Spam,
    FakeProfile,
    Underage,
    Inappropriate,
    Other
}

public enum ReportStatus { Open, Reviewed, ActionTaken, Dismissed }

public enum FlawCategory
{
    Habits,
    Baggage,
    Hygiene,
    Money,
    Temper,
    Quirks,
    Dealbreaker,
    Other
}
