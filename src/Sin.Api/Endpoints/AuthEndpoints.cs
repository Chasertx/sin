using System.Text;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Services;
using Sin.Shared;
using static Sin.Api.Endpoints.Mapping;

namespace Sin.Api.Endpoints;

public static class AuthEndpoints
{
    /// <summary>Same message for every failed login, so it never reveals whether an email is registered.</summary>
    public const string LoginFailed = "Wrong email or password. If you signed up with Google or Apple, use that button.";

    public static void MapAuthEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth").RequireRateLimiting("auth");

        g.MapPost("/register", async (RegisterRequest r, SinDb db, TokenService tokens, ContentFilter filter) =>
        {
            var email = r.Email?.Trim().ToLowerInvariant() ?? "";
            if (!email.Contains('@') || email.Length > 256) return Error("Enter a valid email.");
            if (PasswordPolicy.Check(r.Password) is { } weak) return Error(weak);
            if (string.IsNullOrWhiteSpace(r.DisplayName) || r.DisplayName.Length > 50) return Error("Display name is required (max 50).");
            if (r.Age < 18 || r.Age > 120) return Error("You must be 18 or older.");
            if (filter.Check(r.DisplayName) is { } abusive) return Error(abusive);
            if (await db.Users.AnyAsync(u => u.Email == email)) return Error("That email is already registered.", 409);

            var user = new User
            {
                Email = email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(r.Password),
                DisplayName = r.DisplayName.Trim(),
                Age = r.Age,
                Gender = r.Gender,
                InterestedIn = r.InterestedIn,
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            return Results.Ok(new AuthResponse(tokens.Create(user), user.Id, user.DisplayName));
        });

        g.MapPost("/login", async (LoginRequest r, SinDb db, TokenService tokens, LoginThrottle throttle) =>
        {
            var email = r.Email?.Trim().ToLowerInvariant() ?? "";
            if (throttle.LockedFor(email) is { } wait)
                return Error($"Too many attempts. Try again in {Math.Max(1, (int)Math.Ceiling(wait.TotalMinutes))} minute(s).", 429);

            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);

            // Always run bcrypt, even for unknown emails, so response time doesn't reveal who's registered.
            var hash = user?.PasswordHash ?? PasswordPolicy.DummyHash;
            var passwordOk = BCrypt.Net.BCrypt.Verify(r.Password ?? "", hash) && user?.PasswordHash is not null;
            if (!passwordOk)
            {
                throttle.RecordFailure(email);
                return Error(LoginFailed, 401);
            }

            throttle.Reset(email);
            if (user!.IsBanned) return Error("This account has been suspended.", 403);
            return Results.Ok(new AuthResponse(tokens.Create(user), user.Id, user.DisplayName, user.NeedsOnboarding));
        });
    }
}

public static class PasswordPolicy
{
    public const int MinLength = 8;
    /// <summary>bcrypt only uses the first 72 bytes; longer passwords would silently be truncated.</summary>
    public const int MaxBytes = 72;

    /// <summary>A real bcrypt hash to verify against when the account doesn't exist (constant-time-ish logins).</summary>
    public static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword("not-a-real-password-" + Guid.NewGuid());

    public static string? Check(string? password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < MinLength)
            return $"Password must be at least {MinLength} characters.";
        if (Encoding.UTF8.GetByteCount(password) > MaxBytes)
            return $"Password is too long (max {MaxBytes} bytes, roughly {MaxBytes} letters).";
        return null;
    }
}
