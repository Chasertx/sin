using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Services;
using Sin.Shared;
using static Sin.Api.Endpoints.Mapping;

namespace Sin.Api.Endpoints;

public static class ProfileEndpoints
{
    private static readonly string[] AllowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
    private const long MaxPhotoBytes = 8 * 1024 * 1024;

    public static void MapProfileEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/me").WithTags("My profile").RequireAuthorization();

        g.MapGet("/", async (ClaimsPrincipal me, SinDb db, HttpRequest req) =>
        {
            var user = await db.Users.Include(u => u.Flaws).FirstOrDefaultAsync(u => u.Id == me.UserId());
            return user is null ? Results.NotFound() : Results.Ok(user.ToDto(req));
        });

        g.MapPut("/", async (UpdateProfileRequest r, ClaimsPrincipal me, SinDb db, HttpRequest req, ContentFilter filter,
            IContentModerator moderator, ILoggerFactory logs, CancellationToken ct) =>
        {
            var user = await db.Users.Include(u => u.Flaws).FirstOrDefaultAsync(u => u.Id == me.UserId());
            if (user is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(r.DisplayName) || r.DisplayName.Length > 50) return Error("Display name is required (max 50).");
            if (r.Age < 18 || r.Age > 120) return Error("You must be 18 or older.");
            // Age is set once (at sign-up, or during onboarding after Google/Apple sign-in) and then locked.
            if (user.Age >= 18 && r.Age != user.Age) return Error("Your age can't be changed once it's set.");
            var headline = string.IsNullOrWhiteSpace(r.Headline) ? null : r.Headline.Trim();
            if (headline?.Length > Limits.HeadlineMaxLength) return Error($"Headline max {Limits.HeadlineMaxLength} characters.");
            if (filter.Check(r.DisplayName) is { } badName) return Error(badName);
            if (filter.Check(headline) is { } badHeadline) return Error(badHeadline);
            if (NegativityGuard.Check(headline) is { } brag) return Error(brag);
            if (r.HeightInches is < Limits.MinHeightInches or > Limits.MaxHeightInches) return Error("That height doesn't look right.");
            if (r.Ethnicity is { } ethnicity && !Enum.IsDefined(ethnicity)) return Error("Pick one of the listed options.");

            // Only ask the AI screen about words that actually changed.
            var displayName = r.DisplayName.Trim();
            if (displayName != user.DisplayName || headline != user.Headline)
            {
                var check = await moderator.CheckTextAsync("display name and headline",
                    $"Display name: {displayName}\nHeadline: {headline ?? "(none)"}", ct);
                if (await RejectTextAsync(check, user.Id, "profile", db, logs) is { } rejected) return rejected;
            }

            user.DisplayName = displayName;
            user.Age = r.Age;
            user.Gender = r.Gender;
            user.InterestedIn = r.InterestedIn;
            user.Headline = headline;
            user.HeightInches = r.HeightInches;
            user.Ethnicity = r.Ethnicity;
            await db.SaveChangesAsync();
            return Results.Ok(user.ToDto(req));
        });

        // Where you are. Ick is US-only, so this is also what lets you into Discover.
        g.MapPut("/location", async (LocationRequest r, ClaimsPrincipal me, SinDb db, LocationBypass bypass) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me.UserId());
            if (user is null) return Results.NotFound();

            if (UsGeo.IsInUs(r.Latitude, r.Longitude, r.CountryCode))
            {
                (user.Latitude, user.Longitude) = UsGeo.Coarsen(r.Latitude, r.Longitude);
                user.LocatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
                return Results.NoContent();
            }

            if (bypass.Covers(user))
            {
                bypass.Place(user);
                await db.SaveChangesAsync();
                return Results.NoContent();
            }

            // Outside the US: forget the old location too, so they drop out of everyone's Discover.
            user.Latitude = user.Longitude = null;
            user.LocatedAt = null;
            await db.SaveChangesAsync();
            return Error("Ick is only available in the United States right now.", StatusCodes.Status403Forbidden, ErrorCodes.OutsideUs);
        });

        // Discover filters: who you want to see.
        g.MapGet("/preferences", async (ClaimsPrincipal me, SinDb db) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me.UserId());
            return user is null ? Results.NotFound() : Results.Ok(user.ToPreferences());
        });

        g.MapPut("/preferences", async (PreferencesDto r, ClaimsPrincipal me, SinDb db) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me.UserId());
            if (user is null) return Results.NotFound();

            if (r.MinAge is < Limits.MinAge or > Limits.MaxAge) return Error($"Ages start at {Limits.MinAge}.");
            if (r.MaxAge is { } maxAge && (maxAge < r.MinAge || maxAge > Limits.MaxAge)) return Error("The oldest age can't be below the youngest.");
            if (r.MaxDistanceMiles is < 1 or > Limits.MaxDistanceMiles) return Error("Pick a distance of at least 1 mile.");
            if (r.MinHeightInches is < Limits.MinHeightInches or > Limits.MaxHeightInches
                || r.MaxHeightInches is < Limits.MinHeightInches or > Limits.MaxHeightInches)
                return Error("That height doesn't look right.");
            if (r.MinHeightInches > r.MaxHeightInches) return Error("The tallest height can't be below the shortest.");
            var ethnicities = (r.Ethnicities ?? []).Distinct().ToList();
            if (ethnicities.Any(e => !Enum.IsDefined(e))) return Error("Pick from the listed options.");

            user.PrefMinAge = r.MinAge == Limits.MinAge ? null : r.MinAge;
            user.PrefMaxAge = r.MaxAge;
            user.PrefMaxDistanceMiles = r.MaxDistanceMiles;
            user.PrefMinHeightInches = r.MinHeightInches;
            user.PrefMaxHeightInches = r.MaxHeightInches;
            // Ticking every box is the same as ticking none.
            user.PrefEthnicities = ethnicities.Count is 0 || ethnicities.Count == Enum.GetValues<Ethnicity>().Length
                ? null
                : string.Join(',', ethnicities.Order());
            await db.SaveChangesAsync();
            return Results.Ok(user.ToPreferences());
        });

        g.MapPost("/photo", async (IFormFile file, ClaimsPrincipal me, SinDb db, HttpRequest req, IPhotoStore photos,
            IContentModerator moderator, ILoggerFactory logs, CancellationToken ct) =>
        {
            if (file.Length == 0 || file.Length > MaxPhotoBytes) return Error("Photo must be under 8 MB.");
            if (!AllowedImageTypes.Contains(file.ContentType)) return Error("Photo must be JPEG, PNG or WEBP.");

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me.UserId());
            if (user is null) return Results.NotFound();

            // Re-encode rather than store the upload as-is: strips GPS/device data and rejects non-images.
            await using var upload = file.OpenReadStream();
            await using var clean = await PhotoProcessor.NormalizeAsync(upload);
            if (clean is null) return Error("That file doesn't look like a photo we can read. Try a JPEG or PNG.");

            // Nothing is stored or shown to anyone until the AI screen has passed it. If the screen is
            // down the upload is refused: a photo is optional, and an unchecked one could be anything.
            var check = await moderator.CheckPhotoAsync(PhotoProcessor.ModerationCopy(clean.ToArray()), ct);
            if (check.Verdict == ModerationVerdict.Unavailable)
                return Error("We couldn't check that photo just now. Try again in a minute.", StatusCodes.Status503ServiceUnavailable);
            if (check.Verdict == ModerationVerdict.Blocked)
            {
                await RecordBlockAsync(check, user.Id, "photo", db, logs);
                return Error("That photo can't go on Ick. Unflattering is the goal; nudity, sexual content and gore aren't allowed.");
            }

            var name = $"{user.Id:N}-{DateTime.UtcNow.Ticks}.jpg";
            await photos.SaveAsync(name, clean, "image/jpeg");

            if (user.PhotoFile is not null)
                await photos.DeleteAsync(user.PhotoFile);
            user.PhotoFile = name;
            await db.SaveChangesAsync();
            return Results.Ok(new PhotoUploadResponse(req.PhotoUrl(name)!));
        }).DisableAntiforgery();

        g.MapPost("/flaws", async (CreateFlawRequest r, ClaimsPrincipal me, SinDb db, ContentFilter filter,
            IContentModerator moderator, ILoggerFactory logs, CancellationToken ct) =>
        {
            var text = r.Text?.Trim() ?? "";
            if (text.Length < Limits.FlawMinLength || text.Length > Limits.FlawMaxLength)
                return Error($"A flaw must be {Limits.FlawMinLength}-{Limits.FlawMaxLength} characters.");
            if (filter.Check(text) is { } abusive) return Error(abusive);
            if (NegativityGuard.Check(text) is { } brag) return Error(brag);

            var userId = me.UserId();
            if (await db.Flaws.CountAsync(f => f.UserId == userId) >= Limits.MaxFlaws)
                return Error($"Max {Limits.MaxFlaws} flaws. Nobody needs to know that much.");

            var check = await moderator.CheckTextAsync("confession", text, ct);
            if (await RejectTextAsync(check, userId, "confession", db, logs) is { } rejected) return rejected;

            var flaw = new Flaw { UserId = userId, Category = r.Category, Text = text };
            db.Flaws.Add(flaw);
            await db.SaveChangesAsync();
            return Results.Ok(flaw.ToDto());
        });

        g.MapDelete("/flaws/{id:guid}", async (Guid id, ClaimsPrincipal me, SinDb db) =>
        {
            var deleted = await db.Flaws.Where(f => f.Id == id && f.UserId == me.UserId()).ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });
    }

    /// <summary>
    /// Turns a blocked verdict into the error response. If the AI screen is down, text is let through:
    /// the word filter has already run, and confessions are how the app works at all.
    /// </summary>
    private static async Task<IResult?> RejectTextAsync(ModerationResult check, Guid userId, string what, SinDb db, ILoggerFactory logs)
    {
        if (check.Verdict != ModerationVerdict.Blocked) return null;
        await RecordBlockAsync(check, userId, what, db, logs);
        return Error("That's too graphic for Ick. Confess away, but keep it free of explicit sex and gore.");
    }

    private static async Task RecordBlockAsync(ModerationResult check, Guid userId, string what, SinDb db, ILoggerFactory logs)
    {
        logs.CreateLogger("Moderation").LogWarning("Blocked {What} from {UserId}: {Category}. {Reason}", what, userId, check.Category, check.Reason);
        if (!check.InvolvesMinors) return;

        // Rejecting isn't enough here: put the account in front of a human moderator.
        var details = $"Automatic: blocked a {what} for sexual content involving an apparent minor. {check.Reason}".Trim();
        db.Reports.Add(new Report
        {
            ReporterId = Guid.Empty, // filed by the system, not a member
            ReportedId = userId,
            Reason = ReportReason.Underage,
            Details = details.Length > Limits.ReportDetailsMaxLength ? details[..Limits.ReportDetailsMaxLength] : details,
        });
        await db.SaveChangesAsync();
    }
}
