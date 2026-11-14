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

        g.MapPut("/", async (UpdateProfileRequest r, ClaimsPrincipal me, SinDb db, HttpRequest req, ContentFilter filter) =>
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

            user.DisplayName = r.DisplayName.Trim();
            user.Age = r.Age;
            user.Gender = r.Gender;
            user.InterestedIn = r.InterestedIn;
            user.Headline = headline;
            await db.SaveChangesAsync();
            return Results.Ok(user.ToDto(req));
        });

        g.MapPost("/photo", async (IFormFile file, ClaimsPrincipal me, SinDb db, HttpRequest req, IPhotoStore photos) =>
        {
            if (file.Length == 0 || file.Length > MaxPhotoBytes) return Error("Photo must be under 8 MB.");
            if (!AllowedImageTypes.Contains(file.ContentType)) return Error("Photo must be JPEG, PNG or WEBP.");

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == me.UserId());
            if (user is null) return Results.NotFound();

            // Re-encode rather than store the upload as-is: strips GPS/device data and rejects non-images.
            await using var upload = file.OpenReadStream();
            await using var clean = await PhotoProcessor.NormalizeAsync(upload);
            if (clean is null) return Error("That file doesn't look like a photo we can read. Try a JPEG or PNG.");

            var name = $"{user.Id:N}-{DateTime.UtcNow.Ticks}.jpg";
            await photos.SaveAsync(name, clean, "image/jpeg");

            if (user.PhotoFile is not null)
                await photos.DeleteAsync(user.PhotoFile);
            user.PhotoFile = name;
            await db.SaveChangesAsync();
            return Results.Ok(new PhotoUploadResponse(req.PhotoUrl(name)!));
        }).DisableAntiforgery();

        g.MapPost("/flaws", async (CreateFlawRequest r, ClaimsPrincipal me, SinDb db, ContentFilter filter) =>
        {
            var text = r.Text?.Trim() ?? "";
            if (text.Length < Limits.FlawMinLength || text.Length > Limits.FlawMaxLength)
                return Error($"A flaw must be {Limits.FlawMinLength}-{Limits.FlawMaxLength} characters.");
            if (filter.Check(text) is { } abusive) return Error(abusive);
            if (NegativityGuard.Check(text) is { } brag) return Error(brag);

            var userId = me.UserId();
            if (await db.Flaws.CountAsync(f => f.UserId == userId) >= Limits.MaxFlaws)
                return Error($"Max {Limits.MaxFlaws} flaws. Nobody needs to know that much.");

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
}
