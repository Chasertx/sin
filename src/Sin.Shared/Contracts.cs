namespace Sin.Shared;

public record RegisterRequest(
    string Email,
    string Password,
    string DisplayName,
    int Age,
    Gender Gender,
    InterestedIn InterestedIn);

public record LoginRequest(string Email, string Password);

public record VerifyEmailRequest(Guid UserId, string Token);

public record ResendVerificationRequest(Guid UserId);

/// <param name="NeedsOnboarding">True for brand-new SSO accounts that still need age/gender/preferences.</param>
/// <param name="EmailVerificationRequired">True if the user must verify their email before they can swipe.</param>
public record AuthResponse(string Token, Guid UserId, string DisplayName, bool NeedsOnboarding = false, bool EmailVerificationRequired = false);

/// <summary>Response after sign-up: user created but must verify email before they can log in.</summary>
public record SignUpResponse(Guid UserId, string Email, string DisplayName);

public record FlawDto(Guid Id, FlawCategory Category, string Text);

public record CreateFlawRequest(FlawCategory Category, string Text);

/// <summary>A profile as seen by anyone: nothing but the bad news.</summary>
/// <param name="Ethnicity">Only ever filled in on your own profile; other people's is never sent.</param>
/// <param name="DistanceMiles">How far this person is from you, in whole miles. Null on your own profile.</param>
public record ProfileDto(
    Guid Id,
    string DisplayName,
    int Age,
    Gender Gender,
    InterestedIn InterestedIn,
    string? Headline,
    string? PhotoUrl,
    List<FlawDto> Flaws,
    int? HeightInches = null,
    Ethnicity? Ethnicity = null,
    int? DistanceMiles = null);

public record UpdateProfileRequest(
    string DisplayName,
    int Age,
    Gender Gender,
    InterestedIn InterestedIn,
    string? Headline,
    int? HeightInches = null,
    Ethnicity? Ethnicity = null);

/// <summary>Discover filters. A null bound means "no limit"; an empty ethnicity list means everyone.</summary>
public record PreferencesDto(
    int MinAge = Limits.MinAge,
    int? MaxAge = null,
    int? MaxDistanceMiles = null,
    int? MinHeightInches = null,
    int? MaxHeightInches = null,
    List<Ethnicity>? Ethnicities = null);

/// <param name="CountryCode">Two-letter country the phone resolved the coordinates to, when it could.</param>
public record LocationRequest(double Latitude, double Longitude, string? CountryCode = null);

/// <param name="CanLiveWithIt">true = swipe right ("I can live with that"), false = "Dealbreaker".</param>
public record SwipeRequest(Guid TargetUserId, bool CanLiveWithIt);

public record SwipeResult(bool IsMatch, Guid? MatchId);

public record MatchDto(
    Guid MatchId,
    Guid OtherUserId,
    string OtherName,
    string? OtherPhotoUrl,
    string? LastMessage,
    DateTime MatchedAt);

/// <summary>One match in your history, whether it is still going or over.</summary>
/// <param name="Id">Stable key for lists; not a match id.</param>
/// <param name="OtherName">Null when that person has since deleted their account.</param>
/// <param name="OtherPhotoUrl">Only for matches that are still going.</param>
/// <param name="EndedAt">Null while you are still matched.</param>
/// <param name="EndedByMe">True if you were the one who unmatched or blocked.</param>
/// <param name="MatchId">Only for matches that are still going: opens the chat.</param>
public record MatchHistoryDto(
    string Id,
    string? OtherName,
    string? OtherPhotoUrl,
    DateTime MatchedAt,
    DateTime? EndedAt,
    bool EndedByMe,
    Guid? MatchId,
    Guid? OtherUserId);

public record MessageDto(long Id, Guid SenderId, string Text, DateTime SentAt);

public record SendMessageRequest(string Text);

/// <param name="Code">Set when the app needs to react to the error, not just show it. See <see cref="ErrorCodes"/>.</param>
public record ErrorResponse(string Error, string? Code = null);

public static class ErrorCodes
{
    /// <summary>We don't know where this person is yet, so they can't browse or swipe.</summary>
    public const string LocationRequired = "location_required";
    /// <summary>The location they shared is outside the United States.</summary>
    public const string OutsideUs = "outside_us";
    /// <summary>Signed in with Google or Apple but hasn't given their age and preferences yet.</summary>
    public const string ProfileRequired = "profile_required";
}

public record ReportRequest(ReportReason Reason, string? Details);

public record ReportDto(long Id, Guid ReporterId, Guid ReportedId, string ReportedName, ReportReason Reason,
    string? Details, ReportStatus Status, DateTime CreatedAt);

public record PhotoUploadResponse(string PhotoUrl);

public static class Limits
{
    public const int MaxFlaws = 12;
    public const int MinFlawsToAppearInFeed = 1;
    public const int FlawMinLength = 3;
    public const int FlawMaxLength = 280;
    public const int HeadlineMaxLength = 140;
    public const int MessageMaxLength = 1000;
    public const int ReportDetailsMaxLength = 1000;
    public const int MinAge = 18;
    public const int MaxAge = 120;
    /// <summary>4'0" to 8'0".</summary>
    public const int MinHeightInches = 48;
    public const int MaxHeightInches = 96;
    public const int MaxDistanceMiles = 5000;
}
