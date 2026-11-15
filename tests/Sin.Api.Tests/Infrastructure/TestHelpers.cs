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

    /// <summary>A real, decodable image upload (optionally carrying GPS data or a sideways-rotation flag).</summary>
    public static MultipartFormDataContent Photo(string contentType, int width = 32, int height = 24, bool withGps = false, ushort? orientation = null)
    {
        using var image = new ImageMagick.MagickImage(ImageMagick.MagickColors.CornflowerBlue, (uint)width, (uint)height);
        if (withGps || orientation is not null)
        {
            var exif = new ImageMagick.ExifProfile();
            if (withGps)
            {
                exif.SetValue(ImageMagick.ExifTag.GPSLatitudeRef, "N");
                exif.SetValue(ImageMagick.ExifTag.GPSLatitude,
                    [new ImageMagick.Rational(40, 1), new ImageMagick.Rational(42, 1), new ImageMagick.Rational(46, 1)]);
                exif.SetValue(ImageMagick.ExifTag.Make, "TestPhone");
            }
            if (orientation is { } o) exif.SetValue(ImageMagick.ExifTag.Orientation, o);
            image.SetProfile(exif);
            if (orientation is { } tag) image.Orientation = (ImageMagick.Orientation)tag;
        }
        image.Format = contentType switch
        {
            "image/png" => ImageMagick.MagickFormat.Png,
            "image/webp" => ImageMagick.MagickFormat.WebP,
            _ => ImageMagick.MagickFormat.Jpeg,
        };
        var file = new ByteArrayContent(image.ToByteArray());
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", "photo" } };
    }

    /// <summary>Where test users live unless a test says otherwise.</summary>
    public static readonly LocationRequest NewYork = new(40.7128, -74.0060, "US");
    public static readonly LocationRequest Philadelphia = new(39.9526, -75.1652, "US"); // about 80 miles from New York
    public static readonly LocationRequest LosAngeles = new(34.0522, -118.2437, "US");
    public static readonly LocationRequest Toronto = new(43.6532, -79.3832, "CA");
    public static readonly LocationRequest London = new(51.5074, -0.1278, "GB");

    /// <summary>Registers a user through the API, in New York, and returns a client that's signed in as them.</summary>
    public static async Task<TestUser> CreateUserAsync(
        this ApiFactory factory,
        string? name = null,
        Gender gender = Gender.Woman,
        InterestedIn interestedIn = InterestedIn.Everyone,
        int age = 30,
        params string[] flaws)
    {
        var user = await factory.CreateUnlocatedUserAsync(name, gender, interestedIn, age, flaws: flaws);
        await user.LocateAsync(NewYork);
        return user;
    }

    public static async Task LocateAsync(this TestUser user, LocationRequest where)
    {
        var res = await user.Client.PutAsJsonAsync("/api/me/location", where, Json);
        Assert.True(res.IsSuccessStatusCode, $"set location failed: {res.StatusCode} {await res.Content.ReadAsStringAsync()}");
    }

    /// <summary>A user who has never shared a location: registered, but not let into Discover.</summary>
    public static async Task<TestUser> CreateUnlocatedUserAsync(
        this ApiFactory factory,
        string? name = null,
        Gender gender = Gender.Woman,
        InterestedIn interestedIn = InterestedIn.Everyone,
        int age = 30,
        string? email = null,
        params string[] flaws)
    {
        name ??= "User" + Random.Shared.Next(1000, 9999);
        email ??= UniqueEmail(name.ToLowerInvariant());
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

    /// <summary>The machine-readable code of a 403 (e.g. "location_required").</summary>
    public static async Task<string?> ErrorCodeAsync(this HttpResponseMessage res)
    {
        var body = await res.Content.ReadAsStringAsync();
        Assert.True(res.StatusCode == HttpStatusCode.Forbidden, $"expected 403, got {(int)res.StatusCode}: {body}");
        return JsonSerializer.Deserialize<ErrorResponse>(body, Json)?.Code;
    }

    public static async Task<PreferencesDto> SetPreferencesAsync(this TestUser u, PreferencesDto prefs) =>
        await (await u.Client.PutAsJsonAsync("/api/me/preferences", prefs, Json)).ReadAsync<PreferencesDto>();

    /// <summary>Fills in the optional profile details straight in the database.</summary>
    public static Task DescribeAsync(this ApiFactory factory, TestUser user, int? height = null, Ethnicity? ethnicity = null) =>
        factory.WithDbAsync(db => db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(s => s
            .SetProperty(u => u.HeightInches, height)
            .SetProperty(u => u.Ethnicity, ethnicity)));

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
