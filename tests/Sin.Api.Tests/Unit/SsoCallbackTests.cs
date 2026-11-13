using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Sin.Api.Endpoints;

namespace Sin.Api.Tests.Unit;

/// <summary>The SSO redirect carries a login token, so where it may go is security-critical.</summary>
public class SsoCallbackTests
{
    private static readonly IConfiguration Config = new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?> { ["Sso:CallbackScheme"] = "sin" })
        .Build();

    private static string Resolve(string? returnUrl, string environment) =>
        SsoEndpoints.ResolveCallback(returnUrl, Config, new FakeEnv(environment));

    [Theory]
    [InlineData("Production")]
    [InlineData("Development")]
    public void Defaults_to_app_scheme(string env) => Assert.Equal("sin://auth", Resolve(null, env));

    [Theory]
    [InlineData("https://evil.example.com/steal")]
    [InlineData("http://localhost/whatever")]
    [InlineData("javascript:alert(1)")]
    [InlineData("not a url")]
    public void Never_redirects_to_web_or_garbage(string url)
    {
        Assert.Equal("sin://auth", Resolve(url, "Production"));
        Assert.Equal("sin://auth", Resolve(url, "Development"));
    }

    [Fact]
    public void Allows_the_app_scheme_with_a_path() => Assert.Equal("sin://auth/done", Resolve("sin://auth/done", "Production"));

    [Fact]
    public void Allows_expo_go_urls_only_in_development()
    {
        const string expo = "exp://192.168.1.20:8081/--/auth";
        Assert.Equal(expo, Resolve(expo, "Development"));
        Assert.Equal("sin://auth", Resolve(expo, "Production"));
    }

    [Fact]
    public void Strips_any_fragment_so_the_token_fragment_cannot_be_hijacked() =>
        Assert.Equal("sin://auth", Resolve("sin://auth#token=attacker", "Production"));

    private sealed class FakeEnv(string name) : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "test";
        public string WebRootPath { get; set; } = "";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
