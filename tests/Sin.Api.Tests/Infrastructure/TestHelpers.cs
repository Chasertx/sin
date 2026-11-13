using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Sin.Shared;

namespace Sin.Api.Tests.Infrastructure;

public record TestUser(Guid Id, string Name, string Email, string Password, HttpClient Client);

public static class TestHelpers
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public static string UniqueEmail(string prefix = "user") => $"{prefix}-{Guid.NewGuid():N}@test.app";

    /// <summary>Registers a user through the API and returns a client that's signed in as them.</summary>
    public static async Task<TestUser> CreateUserAsync(
        this ApiFactory factory,
        string? name = null,
        Gender gender = Gender.Woman,
        InterestedIn interestedIn = InterestedIn.Everyone,
        int age = 30,
        params string[] flaws)
    {
        name ??= "User" + Random.Shared.Next(1000, 9999);
        var email = UniqueEmail(name.ToLowerInvariant());
        const string password = "password123";

        var anon = factory.CreateClient();
        var res = await anon.PostAsJsonAsync("/api/auth/register",
            new RegisterRequest(email, password, name, age, gender, interestedIn), Json);
        Assert.True(res.IsSuccessStatusCode, $"register failed: {res.StatusCode} {await res.Content.ReadAsStringAsync()}");
        var auth = (await res.Content.ReadFromJsonAsync<AuthResponse>(Json))!;

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);

        foreach (var flaw in flaws)
        {
            var f = await client.PostAsJsonAsync("/api/me/flaws", new CreateFlawRequest(FlawCategory.Habits, flaw), Json);
            Assert.True(f.IsSuccessStatusCode, $"add flaw failed: {await f.Content.ReadAsStringAsync()}");
        }

        return new TestUser(auth.UserId, name, email, password, client);
    }

    /// <summary>A user who is visible in feeds (has one confession).</summary>
    public static Task<TestUser> CreateVisibleUserAsync(this ApiFactory factory, string? name = null,
        Gender gender = Gender.Woman, InterestedIn interestedIn = InterestedIn.Everyone) =>
        factory.CreateUserAsync(name, gender, interestedIn, 30, "I leave one sip in every glass.");

    /// <summary>Makes two users match via mutual right-swipes; returns the match id.</summary>
    public static async Task<Guid> MatchAsync(TestUser a, TestUser b)
    {
        await a.Client.PostAsJsonAsync("/api/swipes", new SwipeRequest(b.Id, true), Json);
        var res = await b.Client.PostAsJsonAsync("/api/swipes", new SwipeRequest(a.Id, true), Json);
        var result = (await res.Content.ReadFromJsonAsync<SwipeResult>(Json))!;
        Assert.True(result.IsMatch);
        return result.MatchId!.Value;
    }

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage res)
    {
        Assert.True(res.IsSuccessStatusCode, $"expected success, got {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return (await res.Content.ReadFromJsonAsync<T>(Json))!;
    }

    public static async Task<string> ErrorAsync(this HttpResponseMessage res, HttpStatusCode expected = HttpStatusCode.BadRequest)
    {
        var body = await res.Content.ReadAsStringAsync();
        Assert.True(res.StatusCode == expected, $"expected {(int)expected}, got {(int)res.StatusCode}: {body}");
        return JsonSerializer.Deserialize<ErrorResponse>(body, Json)?.Error ?? "";
    }

    public static Task<HttpResponseMessage> PostJsonAsync<T>(this HttpClient c, string url, T body) => c.PostAsJsonAsync(url, body, Json);
    public static Task<HttpResponseMessage> PutJsonAsync<T>(this HttpClient c, string url, T body) => c.PutAsJsonAsync(url, body, Json);

    public static async Task<List<ProfileDto>> FeedAsync(this TestUser u) =>
        await (await u.Client.GetAsync("/api/feed?take=50")).ReadAsync<List<ProfileDto>>();

    public static async Task<List<MatchDto>> MatchesAsync(this TestUser u) =>
        await (await u.Client.GetAsync("/api/matches")).ReadAsync<List<MatchDto>>();

    public static HttpClient AdminClient(this ApiFactory factory)
    {
        var c = factory.CreateClient();
        c.DefaultRequestHeaders.Add("X-Admin-Key", ApiFactory.AdminKey);
        return c;
    }

    public static Task SetAgeAsync(this ApiFactory factory, Guid userId, int age) =>
        factory.WithDbAsync(db => db.Users.Where(u => u.Id == userId).ExecuteUpdateAsync(s => s.SetProperty(u => u.Age, age)));
}
