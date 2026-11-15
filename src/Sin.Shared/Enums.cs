namespace Sin.Shared;

public enum Gender { Man, Woman, NonBinary }

public enum InterestedIn { Men, Women, Everyone }

/// <summary>Optional, self-described. Only used so people can filter who they see.</summary>
public enum Ethnicity
{
    Asian,
    Black,
    HispanicLatino,
    MiddleEastern,
    Multiracial,
    NativeAmerican,
    PacificIslander,
    SouthAsian,
    White,
    Other
}

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
