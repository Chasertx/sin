using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Services;
using Sin.Shared;
using static Sin.Api.Endpoints.Mapping;

namespace Sin.Api.Endpoints;

public static class MatchEndpoints
{
    public static void MapMatchEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/matches").WithTags("Matches & chat").RequireAuthorization();

        g.MapGet("/", async (ClaimsPrincipal principal, SinDb db, HttpRequest req) =>
        {
            var meId = principal.UserId();
            var matches = await db.Matches
                .Where(m => m.UserAId == meId || m.UserBId == meId)
                .Select(m => new
                {
                    m.Id,
                    m.CreatedAt,
                    OtherId = m.UserAId == meId ? m.UserBId : m.UserAId,
                    LastMessage = m.Messages.OrderByDescending(x => x.Id).Select(x => x.Text).FirstOrDefault(),
                    LastMessageId = m.Messages.Max(x => (long?)x.Id),
                })
                .ToListAsync();

            var otherIds = matches.Select(m => m.OtherId).ToList();
            var others = await db.Users.Where(u => otherIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id);

            var result = matches
                .Where(m => others.ContainsKey(m.OtherId))
                .OrderByDescending(m => m.LastMessageId ?? 0).ThenByDescending(m => m.CreatedAt)
                .Select(m => new MatchDto(m.Id, m.OtherId, others[m.OtherId].DisplayName,
                    req.PhotoUrl(others[m.OtherId].PhotoFile), m.LastMessage, m.CreatedAt));
            return Results.Ok(result);
        });

        g.MapGet("/{matchId:guid}/messages", async (Guid matchId, long? after, ClaimsPrincipal principal, SinDb db) =>
        {
            if (!await IsInMatch(db, matchId, principal.UserId())) return Results.NotFound();
            var messages = await db.Messages
                .Where(x => x.MatchId == matchId && x.Id > (after ?? 0))
                .OrderBy(x => x.Id)
                .Take(200)
                .ToListAsync();
            return Results.Ok(messages.Select(x => x.ToDto()));
        });

        g.MapPost("/{matchId:guid}/messages", async (Guid matchId, SendMessageRequest r, ClaimsPrincipal principal, SinDb db) =>
        {
            var meId = principal.UserId();
            if (!await IsInMatch(db, matchId, meId)) return Results.NotFound();
            var text = r.Text?.Trim() ?? "";
            if (text.Length == 0 || text.Length > Limits.MessageMaxLength) return Error($"Messages must be 1-{Limits.MessageMaxLength} characters.");

            var msg = new Message { MatchId = matchId, SenderId = meId, Text = text };
            db.Messages.Add(msg);
            await db.SaveChangesAsync();
            return Results.Ok(msg.ToDto());
        });

        // Unmatch: deletes the match and its messages. Swipes stay so you don't see them again.
        g.MapDelete("/{matchId:guid}", async (Guid matchId, ClaimsPrincipal principal, SinDb db) =>
        {
            var meId = principal.UserId();
            var deleted = await db.Matches
                .Where(m => m.Id == matchId && (m.UserAId == meId || m.UserBId == meId))
                .ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    private static Task<bool> IsInMatch(SinDb db, Guid matchId, Guid userId) =>
        db.Matches.AnyAsync(m => m.Id == matchId && (m.UserAId == userId || m.UserBId == userId));
}
