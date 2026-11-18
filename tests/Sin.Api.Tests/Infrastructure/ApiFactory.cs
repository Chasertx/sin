using System.Collections.Concurrent;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Sin.Api.Data;
using Sin.Api.Services;

namespace Sin.Api.Tests.Infrastructure;

/// <summary>
/// Runs the real API in-process against a throwaway SQLite file, with demo data, rate limits
/// and SSO off unless a test opts in. Photos go to an in-memory store, and the AI moderator is a
/// fake that allows everything unless a test says otherwise.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    public const string AdminKey = "test-admin-key-0123456789abcdef";

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"gwyg-test-{Guid.NewGuid():N}.db");

    /// <summary>Extra configuration a derived factory can set (applied after the defaults).</summary>
    protected virtual IDictionary<string, string?> Overrides => new Dictionary<string, string?>();

    protected virtual string EnvironmentName => "Testing";

    public InMemoryPhotoStore Photos { get; } = new();

    public FakeModerator Moderator { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(EnvironmentName);

        var settings = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Sin"] = $"Data Source={_dbPath}",
            ["Database:Provider"] = "Sqlite",
            ["Jwt:Key"] = "test-signing-key-that-is-long-enough-for-hmac-sha256!",
            ["Demo:SeedUsers"] = "false",
            ["Demo:SeedUsersAlwaysLikeBack"] = "false",
            ["RateLimits:Enabled"] = "false",
            ["Admin:ApiKey"] = AdminKey,
            ["Supabase:Url"] = "",
            ["Moderation:ApiKey"] = "",
            ["Resend:ApiKey"] = "",
            ["Sso:Google:ClientId"] = "",
            ["Sso:Apple:ClientId"] = "",
        };
        foreach (var (k, v) in Overrides) settings[k] = v;
        foreach (var (k, v) in settings) builder.UseSetting(k, v);

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IPhotoStore>();
            services.AddSingleton<IPhotoStore>(Photos);
            services.RemoveAll<IContentModerator>();
            services.AddSingleton<IContentModerator>(Moderator);
        });
    }

    /// <summary>Direct database access for arranging/asserting state the API doesn't expose.</summary>
    public async Task WithDbAsync(Func<SinDb, Task> action)
    {
        using var scope = Services.CreateScope();
        await action(scope.ServiceProvider.GetRequiredService<SinDb>());
    }

    public async Task<T> WithDbAsync<T>(Func<SinDb, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<SinDb>());
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        SqliteConnection.ClearAllPools();
        try { File.Delete(_dbPath); } catch { /* temp file; ignore */ }
    }
}

/// <summary>Development environment (demo auto-like-back, Expo Go SSO return URLs, CORS).</summary>
public class DevApiFactory : ApiFactory
{
    protected override string EnvironmentName => "Development";
    protected override IDictionary<string, string?> Overrides => new Dictionary<string, string?>
    {
        ["Demo:SeedUsersAlwaysLikeBack"] = "true",
    };
}

/// <summary>Rate limits switched on.</summary>
public class RateLimitedApiFactory : ApiFactory
{
    protected override IDictionary<string, string?> Overrides => new Dictionary<string, string?>
    {
        ["RateLimits:Enabled"] = "true",
    };
}

/// <summary>Google SSO configured with dummy credentials (enough to register the provider).</summary>
public class GoogleSsoApiFactory : ApiFactory
{
    protected override IDictionary<string, string?> Overrides => new Dictionary<string, string?>
    {
        ["Sso:Google:ClientId"] = "test-client.apps.googleusercontent.com",
        ["Sso:Google:ClientSecret"] = "test-secret",
    };
}

public class InMemoryPhotoStore : IPhotoStore
{
    public ConcurrentDictionary<string, byte[]> Files { get; } = new();

    public async Task SaveAsync(string name, Stream content, string contentType)
    {
        using var ms = new MemoryStream();
        await content.CopyToAsync(ms);
        Files[name] = ms.ToArray();
    }

    public Task DeleteAsync(string name)
    {
        Files.TryRemove(name, out _);
        return Task.CompletedTask;
    }

    public string Url(string name, HttpRequest request) => $"https://photos.test/{name}";
}

/// <summary>Stands in for the AI moderator: tests choose the verdicts and can see what was checked.</summary>
public class FakeModerator : IContentModerator
{
    public ModerationResult PhotoVerdict { get; set; } = ModerationResult.Allowed;
    public Func<string, ModerationResult> TextVerdict { get; set; } = _ => ModerationResult.Allowed;
    public List<byte[]> PhotosChecked { get; } = [];
    public List<(string Kind, string Text)> TextsChecked { get; } = [];

    public void Reset()
    {
        PhotoVerdict = ModerationResult.Allowed;
        TextVerdict = _ => ModerationResult.Allowed;
        PhotosChecked.Clear();
        TextsChecked.Clear();
    }

    public Task<ModerationResult> CheckPhotoAsync(byte[] jpeg, CancellationToken ct = default)
    {
        PhotosChecked.Add(jpeg);
        return Task.FromResult(PhotoVerdict);
    }

    public Task<ModerationResult> CheckTextAsync(string kind, string text, CancellationToken ct = default)
    {
        TextsChecked.Add((kind, text));
        return Task.FromResult(TextVerdict(text));
    }
}
