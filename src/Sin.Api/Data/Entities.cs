using Sin.Shared;

namespace Sin.Api.Data;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    /// <summary>Null for accounts that only sign in with SSO.</summary>
    public string? PasswordHash { get; set; }
    public required string DisplayName { get; set; }
    public int Age { get; set; }
    public Gender Gender { get; set; }
    public InterestedIn InterestedIn { get; set; }
    /// <summary>One-liner of the worst thing about you.</summary>
    public string? Headline { get; set; }
    /// <summary>File name under wwwroot/uploads (your least flattering photo).</summary>
    public string? PhotoFile { get; set; }
    public bool IsDemo { get; set; }
    /// <summary>Banned by a moderator: can't sign in, hidden everywhere.</summary>
    public bool IsBanned { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>Email has been verified and the account can swipe.</summary>
    public bool EmailVerified { get; set; } = false;

    public int? HeightInches { get; set; }
    public Ethnicity? Ethnicity { get; set; }

    /// <summary>
    /// Last location the phone shared, rounded to about a mile. Only ever set to a point inside the
    /// United States, so "has a location" also means "confirmed in the US". Never sent to anyone.
    /// </summary>
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public DateTime? LocatedAt { get; set; }

    // Discover filters: who this person wants to see. Null means no limit.
    public int? PrefMinAge { get; set; }
    public int? PrefMaxAge { get; set; }
    public int? PrefMaxDistanceMiles { get; set; }
    public int? PrefMinHeightInches { get; set; }
    public int? PrefMaxHeightInches { get; set; }
    /// <summary>Comma-separated <see cref="Sin.Shared.Ethnicity"/> names; null means everyone.</summary>
    public string? PrefEthnicities { get; set; }

    public List<Flaw> Flaws { get; set; } = [];
    public List<ExternalLogin> ExternalLogins { get; set; } = [];

    /// <summary>
    /// Set on the made-up people that fill a practice account's world: the id of the practice account
    /// they belong to. Null for every real member. See <see cref="Sin.Api.Services.PracticeAccounts"/>.
    /// </summary>
    public Guid? PracticeOwnerId { get; set; }

    public bool HasLocation => Latitude is not null && Longitude is not null;

    /// <summary>SSO users start with Age = 0 until they fill in their profile.</summary>
    public bool NeedsOnboarding => Age < 18;
}

/// <summary>A linked SSO identity (Google, Apple...).</summary>
public class ExternalLogin
{
    public required string Provider { get; set; }
    /// <summary>The provider's stable user id ("sub" claim).</summary>
    public required string Subject { get; set; }
    public Guid UserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Flaw
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public FlawCategory Category { get; set; }
    public required string Text { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>BlockerId never sees BlockedId again (and vice versa).</summary>
public class Block
{
    public Guid BlockerId { get; set; }
    public Guid BlockedId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>A user report for moderators to review. Kept even if either account is deleted.</summary>
public class Report
{
    public long Id { get; set; }
    public Guid ReporterId { get; set; }
    public Guid ReportedId { get; set; }
    public ReportReason Reason { get; set; }
    public string? Details { get; set; }
    public ReportStatus Status { get; set; } = ReportStatus.Open;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Swipe
{
    public Guid SwiperId { get; set; }
    public Guid TargetId { get; set; }
    public bool CanLiveWithIt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Match
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserAId { get; set; }
    public Guid UserBId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<Message> Messages { get; set; } = [];
}

/// <summary>
/// One person's record of a match that is over. A match and its messages are deleted when it ends;
/// this is what is kept so History can still say who it was and when. An ended match leaves two
/// rows, one in each person's history.
/// </summary>
public class PastMatch
{
    public long Id { get; set; }
    /// <summary>Whose history this row is in.</summary>
    public Guid UserId { get; set; }
    /// <summary>Null once that person has deleted their account.</summary>
    public Guid? OtherUserId { get; set; }
    /// <summary>Their name when the match ended. Null once they have deleted their account.</summary>
    public string? OtherName { get; set; }
    public DateTime MatchedAt { get; set; }
    public DateTime EndedAt { get; set; } = DateTime.UtcNow;
    /// <summary>True if <see cref="UserId"/> is the one who unmatched or blocked.</summary>
    public bool EndedByMe { get; set; }
}

public class Message
{
    public long Id { get; set; }
    public Guid MatchId { get; set; }
    public Guid SenderId { get; set; }
    public required string Text { get; set; }
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
}

/// <summary>One-time token sent via email for verifying the user's email address.</summary>
public class EmailVerificationToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string Token { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
