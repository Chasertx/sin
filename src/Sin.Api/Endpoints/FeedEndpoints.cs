using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Services;
using Sin.Shared;
using static Sin.Api.Endpoints.Mapping;

namespace Sin.Api.Endpoints;

public static class FeedEndpoints
{
    public static void MapFeedEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api").WithTags("Feed & swiping").RequireAuthorization();

        // Profiles I haven't swiped on, who I'm into and who are into people like me.
        g.MapGet("/feed", async (ClaimsPrincipal principal, SinDb db, HttpRequest req, int? take) =>
        {
            var me = await db.Users.FirstOrDefaultAsync(u => u.Id == principal.UserId());
            if (me is null) return Results.NotFound();

            Gender[] gendersIWant = me.InterestedIn switch
            {
                InterestedIn.Men => [Gender.Man],
                InterestedIn.Women => [Gender.Woman],
                _ => [Gender.Man, Gender.Woman, Gender.NonBinary],
            };
            InterestedIn[] prefsThatWantMe = me.Gender switch
            {
                Gender.Man => [InterestedIn.Men, InterestedIn.Everyone],
                Gender.Woman => [InterestedIn.Women, InterestedIn.Everyone],
                _ => [InterestedIn.Everyone],
            };

            var profiles = await db.Users
                .Include(u => u.Flaws)
                .Where(u => u.Id != me.Id && u.Age >= 18)
                .Where(u => gendersIWant.Contains(u.Gender) && prefsThatWantMe.Contains(u.InterestedIn))
                .Where(u => u.Flaws.Count >= Limits.MinFlawsToAppearInFeed)
                .Where(u => !db.Swipes.Any(s => s.SwiperId == me.Id && s.TargetId == u.Id))
                .OrderBy(_ => EF.Functions.Random())
                .Take(Math.Clamp(take ?? 20, 1, 50))
                .AsSplitQuery()
                .ToListAsync();

            return Results.Ok(profiles.Select(p => p.ToDto(req)));
        });

        g.MapPost("/swipes", async (SwipeRequest r, ClaimsPrincipal principal, SinDb db, IConfiguration config) =>
        {
            var meId = principal.UserId();
            if (r.TargetUserId == meId) return Error("You can't swipe on yourself. We know you want to.");

            var target = await db.Users.FirstOrDefaultAsync(u => u.Id == r.TargetUserId);
            if (target is null) return Results.NotFound();

            var existing = await db.Swipes.FindAsync(meId, target.Id);
            if (existing is not null) return Error("Already swiped on this person.", 409);

            db.Swipes.Add(new Swipe { SwiperId = meId, TargetId = target.Id, CanLiveWithIt = r.CanLiveWithIt });

            // Dev convenience: demo users like you back so you can test matches & chat.
            if (r.CanLiveWithIt && target.IsDemo && config.GetValue<bool>("Demo:SeedUsersAlwaysLikeBack")
                && !await db.Swipes.AnyAsync(s => s.SwiperId == target.Id && s.TargetId == meId))
            {
                db.Swipes.Add(new Swipe { SwiperId = target.Id, TargetId = meId, CanLiveWithIt = true });
                await db.SaveChangesAsync();
            }

            Match? match = null;
            if (r.CanLiveWithIt && await db.Swipes.AnyAsync(s => s.SwiperId == target.Id && s.TargetId == meId && s.CanLiveWithIt))
            {
                match = await db.Matches.FirstOrDefaultAsync(m =>
                    (m.UserAId == meId && m.UserBId == target.Id) || (m.UserAId == target.Id && m.UserBId == meId));
                if (match is null)
                {
                    match = new Match { UserAId = meId, UserBId = target.Id };
                    db.Matches.Add(match);
                }
            }

            await db.SaveChangesAsync();
            return Results.Ok(new SwipeResult(match is not null, match?.Id));
        });
    }
}
