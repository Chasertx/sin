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

    public List<Flaw> Flaws { get; set; } = [];
    public List<ExternalLogin> ExternalLogins { get; set; } = [];

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

public class Message
{
    public long Id { get; set; }
    public Guid MatchId { get; set; }
    public Guid SenderId { get; set; }
    public required string Text { get; set; }
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
}
