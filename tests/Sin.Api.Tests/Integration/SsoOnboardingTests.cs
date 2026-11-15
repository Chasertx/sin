using System.Net;
using Sin.Api.Data;
using Sin.Api.Endpoints;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;

namespace Sin.Api.Tests.Integration;

/// <summary>
/// Someone who signs in with Google or Apple arrives with a name (and maybe an email) but no age.
/// They can't use the app until they finish signing up, and the app is told what the provider
/// already gave us so it can fill that in for them.
/// </summary>
public class SsoOnboardingTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    /// <summary>An account exactly as a first Google sign-in leaves it: located, but age not given yet.</summary>
    private async Task<TestUser> NewcomerAsync()
    {
        var user = await factory.CreateVisibleUserAsync("Newcomer");
        await factory.SetAgeAsync(user.Id, 0);
        return user;
    }

    [Fact]
    public async Task Nobody_browses_or_swipes_before_giving_their_age()
    {
        var someone = await factory.CreateVisibleUserAsync("Someone");
        var newcomer = await NewcomerAsync();

        Assert.Equal(ErrorCodes.ProfileRequired, await (await newcomer.Client.GetAsync("/api/feed")).ErrorCodeAsync());
        var swipe = await newcomer.Client.PostJsonAsync("/api/swipes", new SwipeRequest(someone.Id, true));
        Assert.Equal(ErrorCodes.ProfileRequired, await swipe.ErrorCodeAsync());

        // They can still see and complete their own profile...
        var mine = await (await newcomer.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Equal("Newcomer", mine.DisplayName);
        var update = new UpdateProfileRequest("Newcomer", 17, Gender.Woman, InterestedIn.Everyone, null);
        Assert.Contains("18", await (await newcomer.Client.PutJsonAsync("/api/me", update)).ErrorAsync()); // ...but not as a minor
        await (await newcomer.Client.PutJsonAsync("/api/me", update with { Age = 24 })).ReadAsync<ProfileDto>();

        // ...and then everything opens up.
        Assert.Contains("Someone", (await newcomer.FeedAsync()).Select(p => p.DisplayName));
        Assert.Equal(HttpStatusCode.OK, (await newcomer.Client.PostJsonAsync("/api/swipes", new SwipeRequest(someone.Id, true))).StatusCode);
    }

    [Fact]
    public void The_app_is_told_the_name_and_email_the_provider_gave_us()
    {
        var user = new User { Email = "jess.o'neil+ick@gmail.com", DisplayName = "Jess & Co", Age = 0 };
        var parts = Parse(SsoEndpoints.SessionFragment(user, "tok/en+1"));

        Assert.Equal("tok/en+1", parts["token"]);
        Assert.Equal(user.Id.ToString(), parts["userId"]);
        Assert.Equal("Jess & Co", parts["name"]);
        Assert.Equal("jess.o'neil+ick@gmail.com", parts["email"]);
        Assert.Equal("1", parts["onboarding"]); // no age yet: the app shows the rest of sign-up
    }

    [Fact]
    public void A_returning_member_is_not_sent_through_sign_up_again()
    {
        var user = new User { Email = "back@gmail.com", DisplayName = "Back", Age = 31 };
        Assert.Equal("0", Parse(SsoEndpoints.SessionFragment(user, "t"))["onboarding"]);
    }

    [Fact]
    public void A_stand_in_address_is_never_shown_as_their_email()
    {
        var user = new User { Email = "google-1234567890@sso.sin", DisplayName = "NoEmail", Age = 0 };
        Assert.DoesNotContain("email", Parse(SsoEndpoints.SessionFragment(user, "t")).Keys);
    }

    private static Dictionary<string, string> Parse(string fragment) =>
        fragment.Split('&').Select(p => p.Split('=', 2)).ToDictionary(p => p[0], p => Uri.UnescapeDataString(p[1]));
}
