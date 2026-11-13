using System.Net;
using System.Net.Http.Headers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;

namespace Sin.Api.Tests.Integration;

public class AuthTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _anon = factory.CreateClient();

    private static RegisterRequest Valid(string? email = null) =>
        new(email ?? TestHelpers.UniqueEmail(), "password123", "Casey", 27, Gender.Woman, InterestedIn.Everyone);

    [Fact]
    public async Task Register_returns_a_working_token()
    {
        var auth = await (await _anon.PostJsonAsync("/api/auth/register", Valid())).ReadAsync<AuthResponse>();

        Assert.False(string.IsNullOrWhiteSpace(auth.Token));
        Assert.Equal("Casey", auth.DisplayName);
        Assert.False(auth.NeedsOnboarding);

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        var me = await (await client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Equal(auth.UserId, me.Id);
    }

    [Fact]
    public async Task Register_stores_a_hash_not_the_password()
    {
        var req = Valid();
        await (await _anon.PostJsonAsync("/api/auth/register", req)).ReadAsync<AuthResponse>();
        var hash = await factory.WithDbAsync(db => db.Users.Where(u => u.Email == req.Email).Select(u => u.PasswordHash).SingleAsync());
        Assert.NotEqual(req.Password, hash);
        Assert.StartsWith("$2", hash); // bcrypt
    }

    public static TheoryData<RegisterRequest, string> InvalidRegistrations => new()
    {
        { Valid() with { Email = "not-an-email" }, "valid email" },
        { Valid() with { Password = "short" }, "8 characters" },
        { Valid() with { Password = new string('a', 73) }, "too long" },
        { Valid() with { Password = new string('é', 37) }, "too long" }, // 74 UTF-8 bytes
        { Valid() with { DisplayName = "" }, "Display name" },
        { Valid() with { DisplayName = new string('x', 51) }, "Display name" },
        { Valid() with { Age = 17 }, "18" },
        { Valid() with { Age = 121 }, "18" },
        { Valid() with { DisplayName = "kys" }, "crosses the line" },
    };

    [Theory]
    [MemberData(nameof(InvalidRegistrations))]
    public async Task Register_validates_input(RegisterRequest req, string expectedError)
    {
        var error = await (await _anon.PostJsonAsync("/api/auth/register", req)).ErrorAsync();
        Assert.Contains(expectedError, error);
    }

    [Fact]
    public async Task Register_rejects_duplicate_email_case_insensitively()
    {
        var email = TestHelpers.UniqueEmail();
        await (await _anon.PostJsonAsync("/api/auth/register", Valid(email))).ReadAsync<AuthResponse>();
        var error = await (await _anon.PostJsonAsync("/api/auth/register", Valid(email.ToUpperInvariant()))).ErrorAsync(HttpStatusCode.Conflict);
        Assert.Contains("already registered", error);
    }

    [Fact]
    public async Task Login_succeeds_with_correct_password_ignoring_email_case()
    {
        var u = await factory.CreateUserAsync("Lou");
        var auth = await (await _anon.PostJsonAsync("/api/auth/login", new LoginRequest($"  {u.Email.ToUpperInvariant()} ", u.Password)))
            .ReadAsync<AuthResponse>();
        Assert.Equal(u.Id, auth.UserId);
    }

    [Theory]
    [InlineData("wrong-password")]
    [InlineData("")]
    public async Task Login_rejects_wrong_password(string password)
    {
        var u = await factory.CreateUserAsync();
        var error = await (await _anon.PostJsonAsync("/api/auth/login", new LoginRequest(u.Email, password))).ErrorAsync(HttpStatusCode.Unauthorized);
        Assert.Equal(Sin.Api.Endpoints.AuthEndpoints.LoginFailed, error);
    }

    [Fact]
    public async Task Login_does_not_reveal_whether_an_email_exists()
    {
        var error = await (await _anon.PostJsonAsync("/api/auth/login", new LoginRequest(TestHelpers.UniqueEmail(), "password123")))
            .ErrorAsync(HttpStatusCode.Unauthorized);
        Assert.Equal(Sin.Api.Endpoints.AuthEndpoints.LoginFailed, error);
    }

    [Fact]
    public async Task Sso_only_accounts_get_the_same_message_as_everyone_else()
    {
        var email = TestHelpers.UniqueEmail();
        await factory.WithDbAsync(async db =>
        {
            db.Users.Add(new Api.Data.User { Email = email, DisplayName = "Sso", Age = 30, PasswordHash = null });
            await db.SaveChangesAsync();
        });
        var error = await (await _anon.PostJsonAsync("/api/auth/login", new LoginRequest(email, "anything123"))).ErrorAsync(HttpStatusCode.Unauthorized);
        Assert.Equal(Sin.Api.Endpoints.AuthEndpoints.LoginFailed, error); // doesn't reveal the account exists
        Assert.Contains("Google or Apple", error);
    }

    [Fact]
    public async Task Login_flags_accounts_that_still_need_onboarding()
    {
        var u = await factory.CreateUserAsync();
        await factory.SetAgeAsync(u.Id, 0);
        var auth = await (await _anon.PostJsonAsync("/api/auth/login", new LoginRequest(u.Email, u.Password))).ReadAsync<AuthResponse>();
        Assert.True(auth.NeedsOnboarding);
    }

    [Theory]
    [InlineData("/api/me")]
    [InlineData("/api/feed")]
    [InlineData("/api/matches")]
    public async Task Protected_endpoints_require_a_token(string url) =>
        Assert.Equal(HttpStatusCode.Unauthorized, (await _anon.GetAsync(url)).StatusCode);

    [Fact]
    public async Task Garbage_and_forged_tokens_are_rejected()
    {
        var c = factory.CreateClient();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not.a.jwt");
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/me")).StatusCode);

        // Correct shape but signed with a different key.
        var forged = new Sin.Api.Services.TokenService(new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "some-other-key-that-is-long-enough-for-hmac-sha256!!",
                ["Jwt:Issuer"] = "sin-api",
                ["Jwt:Audience"] = "sin-app",
            }).Build())
            .Create(new Api.Data.User { Email = "x@y.z", DisplayName = "Mallory" });
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", forged);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task Health_endpoint_is_public() =>
        Assert.Equal(HttpStatusCode.OK, (await _anon.GetAsync("/health")).StatusCode);
}

public class LoginLockoutTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Five_wrong_passwords_lock_the_account_even_with_the_right_password()
    {
        var u = await factory.CreateUserAsync();
        var c = factory.CreateClient();
        for (var i = 0; i < 5; i++)
            await (await c.PostJsonAsync("/api/auth/login", new LoginRequest(u.Email, "wrong-password"))).ErrorAsync(HttpStatusCode.Unauthorized);

        var locked = await c.PostJsonAsync("/api/auth/login", new LoginRequest(u.Email, u.Password));
        Assert.Contains("Too many attempts", await locked.ErrorAsync(HttpStatusCode.TooManyRequests));
    }

    [Fact]
    public async Task Unknown_emails_lock_the_same_way_so_lockout_reveals_nothing()
    {
        var c = factory.CreateClient();
        var email = TestHelpers.UniqueEmail("ghost");
        for (var i = 0; i < 5; i++) await c.PostJsonAsync("/api/auth/login", new LoginRequest(email, "x-password"));
        await (await c.PostJsonAsync("/api/auth/login", new LoginRequest(email, "x-password"))).ErrorAsync(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task A_successful_login_resets_the_counter()
    {
        var u = await factory.CreateUserAsync();
        var c = factory.CreateClient();
        for (var i = 0; i < 4; i++) await c.PostJsonAsync("/api/auth/login", new LoginRequest(u.Email, "wrong-password"));
        await (await c.PostJsonAsync("/api/auth/login", new LoginRequest(u.Email, u.Password))).ReadAsync<AuthResponse>();
        for (var i = 0; i < 4; i++) await c.PostJsonAsync("/api/auth/login", new LoginRequest(u.Email, "wrong-password"));
        await (await c.PostJsonAsync("/api/auth/login", new LoginRequest(u.Email, u.Password))).ReadAsync<AuthResponse>();
    }

    [Fact]
    public async Task Lockout_is_per_account_not_global()
    {
        var victim = await factory.CreateUserAsync();
        var other = await factory.CreateUserAsync();
        var c = factory.CreateClient();
        for (var i = 0; i < 5; i++) await c.PostJsonAsync("/api/auth/login", new LoginRequest(victim.Email, "wrong-password"));
        await (await c.PostJsonAsync("/api/auth/login", new LoginRequest(other.Email, other.Password))).ReadAsync<AuthResponse>();
    }
}

public class RateLimitTests(RateLimitedApiFactory factory) : IClassFixture<RateLimitedApiFactory>
{
    [Fact]
    public async Task Login_is_rate_limited_per_client()
    {
        var c = factory.CreateClient();
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 12; i++)
            statuses.Add((await c.PostJsonAsync("/api/auth/login", new LoginRequest(TestHelpers.UniqueEmail("nobody"), "password123"))).StatusCode); // new email each time: tests the per-IP limit, not the per-account lockout

        Assert.All(statuses.Take(10), s => Assert.Equal(HttpStatusCode.Unauthorized, s));
        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[^1]);
    }
}

public class SecurityHeaderTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Theory]
    [InlineData("/health")]
    [InlineData("/api/me")] // even on 401s
    public async Task Every_response_carries_security_headers(string url)
    {
        var res = await factory.CreateClient().GetAsync(url);
        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-referrer", res.Headers.GetValues("Referrer-Policy").Single());
    }

    [Fact]
    public async Task Swagger_is_not_exposed_outside_development() =>
        Assert.Equal(HttpStatusCode.NotFound, (await factory.CreateClient().GetAsync("/swagger/v1/swagger.json")).StatusCode);
}
