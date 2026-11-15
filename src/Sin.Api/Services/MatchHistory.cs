using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;

namespace Sin.Api.Services;

/// <summary>
/// Keeps the "who I matched with, and when it ended" record. Current matches are read straight from
/// the Matches table; this writes the lasting <see cref="PastMatch"/> rows at the moment a match is removed.
/// </summary>
public static class MatchHistory
{
    /// <summary>How many ended matches one person's history returns.</summary>
    public const int MaxPastEntries = 500;

    /// <summary>
    /// Adds history rows for matches that are about to be removed. Nothing is saved here: the caller
    /// removes the matches and saves once, so the two never disagree.
    /// </summary>
    /// <param name="endedById">Who unmatched, blocked, or deleted their account.</param>
    /// <param name="accountDeleted">
    /// True when <paramref name="endedById"/> is deleting their account: they get no row (their history
    /// goes with the account) and the other person's row carries no name or id.
    /// </param>
    public static async Task RecordEndAsync(SinDb db, IReadOnlyCollection<Match> matches, Guid endedById, bool accountDeleted = false)
    {
        if (matches.Count == 0) return;

        var ids = matches.SelectMany(m => new[] { m.UserAId, m.UserBId }).Distinct().ToList();
        var names = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName);
        var now = DateTime.UtcNow;

        foreach (var match in matches)
        {
            foreach (var (owner, other) in new[] { (match.UserAId, match.UserBId), (match.UserBId, match.UserAId) })
            {
                if (accountDeleted && owner == endedById) continue;
                var otherIsLeaving = accountDeleted && other == endedById;
                db.PastMatches.Add(new PastMatch
                {
                    UserId = owner,
                    OtherUserId = otherIsLeaving ? null : other,
                    OtherName = otherIsLeaving ? null : names.GetValueOrDefault(other),
                    MatchedAt = match.CreatedAt,
                    EndedAt = now,
                    EndedByMe = owner == endedById,
                });
            }
        }
    }

    /// <summary>
    /// Account deletion: drops that person's own history and takes their name and id out of
    /// everyone else's, leaving only "matched on, ended on".
    /// </summary>
    public static async Task ForgetAsync(SinDb db, Guid userId)
    {
        await db.PastMatches.Where(p => p.UserId == userId).ExecuteDeleteAsync();
        await db.PastMatches.Where(p => p.OtherUserId == userId).ExecuteUpdateAsync(s => s
            .SetProperty(p => p.OtherUserId, (Guid?)null)
            .SetProperty(p => p.OtherName, (string?)null));
    }
}
