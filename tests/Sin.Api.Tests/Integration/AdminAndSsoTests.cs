using System.Net;
using System.Net.Http.Json;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;

namespace Sin.Api.Tests.Integration;

public class AdminTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Theory]
    [InlineData(null)]
    [InlineData("wrong-key")]
    [InlineData("test-admin-key-0123456789abcdeX")]
    public async Task Admin_api_is_invisible_without_the_right_key(string? key)
    {
        var c = factory.CreateClient();
        if (key is not null) c.DefaultRequestHeaders.Add("X-Admin-Key", key);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/api/admin/reports")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.PostAsync($"/api/admin/users/{Guid.NewGuid()}/ban", null)).StatusCode);
    }

    [Fact]
    public async Task Regular_users_cannot_use_the_admin_api()
    {
        var u = await factory.CreateVisibleUserAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await u.Client.GetAsync("/api/admin/reports")).StatusCode);
    }

    [Fact]
    public async Task Moderators_can_list_and_resolve_reports()
    {
        var reporter = await factory.CreateVisibleUserAsync();
        var reported = await factory.CreateVisibleUserAsync("Troll");
        await reporter.Client.PostJsonAsync($"/api/users/{reported.Id}/report", new ReportRequest(ReportReason.Harassment, "rude"));
        var admin = factory.AdminClient();

        var open = await (await admin.GetAsync("/api/admin/reports")).ReadAsync<List<ReportDto>>();
        var report = Assert.Single(open, r => r.ReportedId == reported.Id);
        Assert.Equal(("Troll", ReportReason.Harassment, "rude"), (report.ReportedName, report.Reason, report.Details));

        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/reports/{report.Id}/status/Dismissed", null)).StatusCode);
        Assert.DoesNotContain(await (await admin.GetAsync("/api/admin/reports")).ReadAsync<List<ReportDto>>(), r => r.Id == report.Id);
        Assert.Contains(await (await admin.GetAsync("/api/admin/reports?status=Dismissed")).ReadAsync<List<ReportDto>>(), r => r.Id == report.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsync("/api/admin/reports/999999/status/Reviewed", null)).StatusCode);
    }

    [Fact]
    public async Task Banning_locks_the_user_out_and_hides_them_everywhere()
    {
        var bad = await factory.CreateVisibleUserAsync("Banned");
        var victim = await factory.CreateVisibleUserAsync();
        await TestHelpers.MatchAsync(bad, victim);
        await victim.Client.PostJsonAsync($"/api/users/{bad.Id}/report", new ReportRequest(ReportReason.Harassment, null));
        var bystander = await factory.CreateVisibleUserAsync();
        var admin = factory.AdminClient();

        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/users/{bad.Id}/ban", null)).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await bad.Client.GetAsync("/api/me")).StatusCode); // existing token dies
        var login = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(bad.Email, bad.Password), TestHelpers.Json);
        Assert.Contains("suspended", await login.ErrorAsync(HttpStatusCode.Forbidden));
        Assert.DoesNotContain(await bystander.FeedAsync(), p => p.Id == bad.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await bystander.Client.PostJsonAsync("/api/swipes", new SwipeRequest(bad.Id, true))).StatusCode);
        // Their open reports are marked handled.
        Assert.DoesNotContain(await (await admin.GetAsync("/api/admin/reports")).ReadAsync<List<ReportDto>>(), r => r.ReportedId == bad.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/users/{bad.Id}/unban", null)).StatusCode);
        await (await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(bad.Email, bad.Password), TestHelpers.Json))
            .ReadAsync<AuthResponse>();
    }

    [Fact]
    public async Task Ban_unknown_user_is_404() =>
        Assert.Equal(HttpStatusCode.NotFound, (await factory.AdminClient().PostAsync($"/api/admin/users/{Guid.NewGuid()}/ban", null)).StatusCode);
}

public class SsoWithoutProvidersTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task No_providers_are_advertised_when_none_are_configured() =>
        Assert.Empty(await (await factory.CreateClient().GetAsync("/api/auth/providers")).ReadAsync<string[]>());

    [Fact]
    public async Task Unconfigured_provider_redirects_back_to_the_app_with_an_error()
    {
        var c = factory.CreateClient(new() { AllowAutoRedirect = false });
        var res = await c.GetAsync("/api/auth/sso/google");
        Assert.Equal(HttpStatusCode.Redirect, res.StatusCode);
        var location = res.Headers.Location!.ToString();
        Assert.StartsWith("sin://auth", location);
        Assert.Contains("#error=", location);
        Assert.DoesNotContain("token=", location);
    }
}

public class SsoWithGoogleTests(GoogleSsoApiFactory factory) : IClassFixture<GoogleSsoApiFactory>
{
    [Fact]
    public async Task Google_is_advertised_when_configured() =>
        Assert.Equal(["Google"], await (await factory.CreateClient().GetAsync("/api/auth/providers")).ReadAsync<string[]>());

    [Fact]
    public async Task Starting_sso_sends_the_user_to_google_with_our_callback()
    {
        var c = factory.CreateClient(new() { AllowAutoRedirect = false });
        var res = await c.GetAsync("/api/auth/sso/Google?returnUrl=sin%3A%2F%2Fauth");
        Assert.Equal(HttpStatusCode.Redirect, res.StatusCode);
        var location = res.Headers.Location!.ToString();
        Assert.StartsWith("https://accounts.google.com/", location);
        Assert.Contains("client_id=test-client.apps.googleusercontent.com", location);
        Assert.Contains("redirect_uri=http%3A%2F%2Flocalhost%2Fsignin-google", location);
    }

    [Fact]
    public async Task Provider_name_is_case_insensitive()
    {
        var c = factory.CreateClient(new() { AllowAutoRedirect = false });
        var res = await c.GetAsync("/api/auth/sso/GOOGLE");
        Assert.StartsWith("https://accounts.google.com/", res.Headers.Location!.ToString());
    }
}
