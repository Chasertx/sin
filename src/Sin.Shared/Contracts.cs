namespace Sin.Shared;

// ---- Auth ----
public record RegisterRequest(
    string Email,
    string Password,
    string DisplayName,
    int Age,
    Gender Gender,
    InterestedIn InterestedIn);

public record LoginRequest(string Email, string Password);

/// <param name="NeedsOnboarding">True for brand-new SSO accounts that still need age/gender/preferences.</param>
public record AuthResponse(string Token, Guid UserId, string DisplayName, bool NeedsOnboarding = false);

// ---- Profile ----
public record FlawDto(Guid Id, FlawCategory Category, string Text);

public record CreateFlawRequest(FlawCategory Category, string Text);

/// <summary>A profile as seen by anyone: nothing but the bad news.</summary>
public record ProfileDto(
    Guid Id,
    string DisplayName,
    int Age,
    Gender Gender,
    InterestedIn InterestedIn,
    string? Headline,
    string? PhotoUrl,
    List<FlawDto> Flaws);

public record UpdateProfileRequest(
    string DisplayName,
    int Age,
    Gender Gender,
    InterestedIn InterestedIn,
    string? Headline);

// ---- Swiping ----
/// <param name="CanLiveWithIt">true = swipe right ("I can live with that"), false = "Dealbreaker".</param>
public record SwipeRequest(Guid TargetUserId, bool CanLiveWithIt);

public record SwipeResult(bool IsMatch, Guid? MatchId);

// ---- Matches & chat ----
public record MatchDto(
    Guid MatchId,
    Guid OtherUserId,
    string OtherName,
    string? OtherPhotoUrl,
    string? LastMessage,
    DateTime MatchedAt);

public record MessageDto(long Id, Guid SenderId, string Text, DateTime SentAt);

public record SendMessageRequest(string Text);

public record ErrorResponse(string Error);

// ---- Safety ----
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
}
