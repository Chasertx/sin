using System.Security.Cryptography;
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

        g.MapPost("/register", async (RegisterRequest r, SinDb db, TokenService tokens, ContentFilter filter,
            PracticeAccounts practice, IPhotoStore photos, ResendEmailService email, HttpContext http) =>
        {
            var emailAddr = r.Email?.Trim().ToLowerInvariant() ?? "";
            if (!emailAddr.Contains('@') || emailAddr.Length > 256) return Error("Enter a valid email.");
            if (PasswordPolicy.Check(r.Password) is { } weak) return Error(weak);
            if (string.IsNullOrWhiteSpace(r.DisplayName) || r.DisplayName.Length > 50) return Error("Display name is required (max 50).");
            if (r.Age < 18 || r.Age > 120) return Error("You must be 18 or older.");
            if (filter.Check(r.DisplayName) is { } abusive) return Error(abusive);
            if (await db.Users.AnyAsync(u => u.Email == emailAddr)) return Error("That email is already registered.", 409);
            var isPractice = practice.IsPracticeEmail(emailAddr);
            if (isPractice && await practice.CountAsync(db) >= practice.MaxAccounts)
                return Error("All the practice accounts are in use right now. Delete one first.", 409);

            var user = new User
            {
                Email = emailAddr,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(r.Password),
                DisplayName = r.DisplayName.Trim(),
                Age = r.Age,
                Gender = r.Gender,
                InterestedIn = r.InterestedIn,
                EmailVerified = isPractice, // Practice accounts skip email verification
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            // A practice account arrives with a filled-in profile and a private cast of made-up people.
            if (isPractice) await practice.PopulateAsync(db, user, photos);

            // For real accounts, create a verification token and send email
            if (!isPractice)
            {
                var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
                var verificationToken = new EmailVerificationToken
                {
                    UserId = user.Id,
                    Token = token,
                    ExpiresAt = DateTime.UtcNow.AddHours(24),
                };
                db.EmailVerificationTokens.Add(verificationToken);
                await db.SaveChangesAsync();

                var scheme = http.Request.Scheme;
                var host = http.Request.Host.Host;
                var verificationUrl = $"{scheme}://{host}/verify-email?token={token}&userId={user.Id}";
                await email.SendVerificationEmailAsync(emailAddr, user.DisplayName, verificationUrl);
            }

            return Results.Ok(new SignUpResponse(user.Id, emailAddr, user.DisplayName));
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
            if (!user.EmailVerified) return Error("Please verify your email before signing in. Check your inbox for a verification link.", 401);
            return Results.Ok(new AuthResponse(tokens.Create(user), user.Id, user.DisplayName, user.NeedsOnboarding));
        });

        g.MapPost("/verify-email", async (VerifyEmailRequest r, SinDb db) =>
        {
            if (string.IsNullOrWhiteSpace(r.Token)) return Error("Token is required.");

            var token = await db.EmailVerificationTokens
                .FirstOrDefaultAsync(t => t.UserId == r.UserId && t.Token == r.Token);

            if (token is null) return Error("Invalid or expired token.", 401);
            if (token.ExpiresAt < DateTime.UtcNow) return Error("Token has expired. Sign up again.", 401);

            var user = await db.Users.FindAsync(r.UserId);
            if (user is null) return Error("User not found.");

            user.EmailVerified = true;
            db.EmailVerificationTokens.Remove(token);
            await db.SaveChangesAsync();

            return Results.Ok(new { message = "Email verified successfully. You can now sign in." });
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
