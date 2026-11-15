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

        // Profiles I haven't swiped on, who I'm into, who are into people like me, and who pass my filters.
        // Everyone involved has shared a US location: that's what keeps Ick US-only.
        g.MapGet("/feed", async (ClaimsPrincipal principal, SinDb db, HttpRequest req, LocationBypass bypass, PracticeAccounts practice, int? take) =>
        {
            var me = await db.Users.FirstOrDefaultAsync(u => u.Id == principal.UserId());
            if (me is null) return Results.NotFound();
            if (!await EnsureLocatedAsync(me, db, bypass)) return LocationRequired();

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

            // Practice accounts and real members live apart: neither ever comes across the other.
            var people = practice.VisibleTo(me, db.Users)
                .Include(u => u.Flaws)
                .Where(u => u.Id != me.Id && u.Age >= 18 && !u.IsBanned)
                .Where(u => u.Latitude != null && u.Longitude != null)
                .Where(u => !db.Blocks.Any(b => (b.BlockerId == me.Id && b.BlockedId == u.Id) || (b.BlockerId == u.Id && b.BlockedId == me.Id)))
                .Where(u => gendersIWant.Contains(u.Gender) && prefsThatWantMe.Contains(u.InterestedIn))
                .Where(u => u.Flaws.Count >= Limits.MinFlawsToAppearInFeed)
                .Where(u => !db.Swipes.Any(s => s.SwiperId == me.Id && s.TargetId == u.Id));

            // ---- My filters. A filter on height or ethnicity only shows people who've filled that in. ----
            if (me.PrefMinAge is { } minAge) people = people.Where(u => u.Age >= minAge);
            if (me.PrefMaxAge is { } maxAge) people = people.Where(u => u.Age <= maxAge);
            if (me.PrefMinHeightInches is { } minHeight) people = people.Where(u => u.HeightInches >= minHeight);
            if (me.PrefMaxHeightInches is { } maxHeight) people = people.Where(u => u.HeightInches <= maxHeight);
            if (me.PreferredEthnicities() is { Count: > 0 } wanted)
            {
                var ethnicities = wanted.Cast<Ethnicity?>().ToArray();
                people = people.Where(u => ethnicities.Contains(u.Ethnicity));
            }
            if (me.PrefMaxDistanceMiles is { } maxMiles)
            {
                // Flat-map distance in plain arithmetic, so it runs inside both SQLite and Postgres.
                // Over a few hundred miles it's within a couple of percent of the real thing.
                double myLat = me.Latitude!.Value, myLng = me.Longitude!.Value;
                var milesPerDegreeLng = UsGeo.MilesPerDegree * Math.Cos(myLat * Math.PI / 180);
                var maxSquared = (double)maxMiles * maxMiles;
                people = people.Where(u =>
                    (u.Latitude!.Value - myLat) * UsGeo.MilesPerDegree * ((u.Latitude!.Value - myLat) * UsGeo.MilesPerDegree)
                    + (u.Longitude!.Value - myLng) * milesPerDegreeLng * ((u.Longitude!.Value - myLng) * milesPerDegreeLng)
                    <= maxSquared);
            }

            var profiles = await people
                .OrderBy(_ => EF.Functions.Random())
                .Take(Math.Clamp(take ?? 20, 1, 50))
                // Single query on purpose: a split query re-runs ORDER BY random() for the
                // Flaws part and attaches confessions for a *different* random set of users.
                .AsSingleQuery()
                .ToListAsync();

            return Results.Ok(profiles.Select(p => p.ToDtoFor(me, req)));
        });

        g.MapPost("/swipes", async (SwipeRequest r, ClaimsPrincipal principal, SinDb db, IConfiguration config, LocationBypass bypass, PracticeAccounts practice) =>
        {
            var meId = principal.UserId();
            if (r.TargetUserId == meId) return Error("You can't swipe on yourself. We know you want to.");

            // No matches with anyone outside the US: both people must have shared a US location.
            var me = await db.Users.FirstOrDefaultAsync(u => u.Id == meId);
            if (me is null) return Results.NotFound();
            if (!await EnsureLocatedAsync(me, db, bypass)) return LocationRequired();

            var target = await db.Users.FirstOrDefaultAsync(u => u.Id == r.TargetUserId && !u.IsBanned);
            if (target is null || !target.HasLocation || !practice.CanSee(me, target)) return Results.NotFound();
            if (await db.Blocks.AnyAsync(b => (b.BlockerId == meId && b.BlockedId == target.Id) || (b.BlockerId == target.Id && b.BlockedId == meId)))
                return Results.NotFound();

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

            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Two taps raced: the other request already recorded this swipe.
                return Error("Already swiped on this person.", 409);
            }
            return Results.Ok(new SwipeResult(match is not null, match?.Id));
        });
    }

    /// <summary>True if this person has a US location, giving bypassed (store reviewer) accounts one on the spot.</summary>
    private static async Task<bool> EnsureLocatedAsync(User me, SinDb db, LocationBypass bypass)
    {
        if (me.HasLocation) return true;
        if (!bypass.Covers(me)) return false;
        bypass.Place(me);
        await db.SaveChangesAsync();
        return true;
    }
}
