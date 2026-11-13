using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Services;
using Sin.Shared;
using static Sin.Api.Endpoints.Mapping;

namespace Sin.Api.Endpoints;

/// <summary>Block, report and delete-account: required by both app stores for social apps.</summary>
public static class SafetyEndpoints
{
    public static void MapSafetyEndpoints(this WebApplication app)
    {
        var users = app.MapGroup("/api/users").WithTags("Safety").RequireAuthorization();

        // Blocking hides both people from each other and ends any match (messages included).
        users.MapPost("/{id:guid}/block", async (Guid id, ClaimsPrincipal principal, SinDb db) =>
        {
            var meId = principal.UserId();
            if (id == meId) return Error("You can't block yourself.");
            if (!await db.Users.AnyAsync(u => u.Id == id)) return Results.NotFound();

            await BlockAsync(db, meId, id);
            return Results.NoContent();
        });

        // Reporting also blocks, so the reporter never sees that person again.
        users.MapPost("/{id:guid}/report", async (Guid id, ReportRequest r, ClaimsPrincipal principal, SinDb db, ILoggerFactory logs) =>
        {
            var meId = principal.UserId();
            if (id == meId) return Error("You can't report yourself.");
            if (!await db.Users.AnyAsync(u => u.Id == id)) return Results.NotFound();
            var details = string.IsNullOrWhiteSpace(r.Details) ? null : r.Details.Trim();
            if (details?.Length > Limits.ReportDetailsMaxLength) return Error($"Details max {Limits.ReportDetailsMaxLength} characters.");

            db.Reports.Add(new Report { ReporterId = meId, ReportedId = id, Reason = r.Reason, Details = details });
            await BlockAsync(db, meId, id);
            logs.CreateLogger("Safety").LogWarning("User {Reporter} reported {Reported} for {Reason}", meId, id, r.Reason);
            return Results.NoContent();
        });

        // Permanently deletes the account and everything it created. Reports about others are kept for moderation.
        app.MapDelete("/api/me", async (ClaimsPrincipal principal, SinDb db, IPhotoStore photos, ILoggerFactory logs) =>
        {
            var meId = principal.UserId();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == meId);
            if (user is null) return Results.NotFound();

            var matchIds = await db.Matches.Where(m => m.UserAId == meId || m.UserBId == meId).Select(m => m.Id).ToListAsync();
            await db.Messages.Where(x => matchIds.Contains(x.MatchId)).ExecuteDeleteAsync();
            await db.Matches.Where(m => matchIds.Contains(m.Id)).ExecuteDeleteAsync();
            await db.Swipes.Where(s => s.SwiperId == meId || s.TargetId == meId).ExecuteDeleteAsync();
            await db.Blocks.Where(b => b.BlockerId == meId || b.BlockedId == meId).ExecuteDeleteAsync();
            await db.Flaws.Where(f => f.UserId == meId).ExecuteDeleteAsync();
            await db.ExternalLogins.Where(x => x.UserId == meId).ExecuteDeleteAsync();
            if (user.PhotoFile is not null)
            {
                try { await photos.DeleteAsync(user.PhotoFile); } catch { /* best effort */ }
            }
            db.Users.Remove(user);
            await db.SaveChangesAsync();

            logs.CreateLogger("Safety").LogInformation("Deleted account {UserId}", meId);
            return Results.NoContent();
        }).RequireAuthorization().WithTags("My profile");
    }

    internal static async Task BlockAsync(SinDb db, Guid blockerId, Guid blockedId)
    {
        if (!await db.Blocks.AnyAsync(b => b.BlockerId == blockerId && b.BlockedId == blockedId))
            db.Blocks.Add(new Block { BlockerId = blockerId, BlockedId = blockedId });

        var matchIds = await db.Matches
            .Where(m => (m.UserAId == blockerId && m.UserBId == blockedId) || (m.UserAId == blockedId && m.UserBId == blockerId))
            .Select(m => m.Id)
            .ToListAsync();
        if (matchIds.Count > 0)
        {
            await db.Messages.Where(x => matchIds.Contains(x.MatchId)).ExecuteDeleteAsync();
            await db.Matches.Where(m => matchIds.Contains(m.Id)).ExecuteDeleteAsync();
        }
        await db.SaveChangesAsync();
    }
}
