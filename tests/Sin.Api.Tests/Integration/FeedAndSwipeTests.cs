using System.Net;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;

namespace Sin.Api.Tests.Integration;

public class FeedTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Feed_never_includes_yourself()
    {
        var me = await factory.CreateVisibleUserAsync();
        Assert.DoesNotContain(await me.FeedAsync(), p => p.Id == me.Id);
    }

    [Fact]
    public async Task Users_without_confessions_are_hidden()
    {
        var me = await factory.CreateVisibleUserAsync();
        var shy = await factory.CreateUserAsync("Shy");
        var open = await factory.CreateVisibleUserAsync("Open");

        var feed = await me.FeedAsync();
        Assert.DoesNotContain(feed, p => p.Id == shy.Id);
        Assert.Contains(feed, p => p.Id == open.Id);
    }

    [Fact]
    public async Task Users_still_onboarding_are_hidden()
    {
        var me = await factory.CreateVisibleUserAsync();
        var onboarding = await factory.CreateVisibleUserAsync("Onboarding");
        await factory.SetAgeAsync(onboarding.Id, 0);
        Assert.DoesNotContain(await me.FeedAsync(), p => p.Id == onboarding.Id);
    }

    // Who sees whom: both people's preferences have to line up.
    [Theory]
    [InlineData(Gender.Man, InterestedIn.Women, Gender.Woman, InterestedIn.Men, true)]
    [InlineData(Gender.Man, InterestedIn.Women, Gender.Woman, InterestedIn.Women, false)] // she isn't into men
    [InlineData(Gender.Man, InterestedIn.Women, Gender.Man, InterestedIn.Men, false)]     // he isn't into men
    [InlineData(Gender.Woman, InterestedIn.Women, Gender.Woman, InterestedIn.Women, true)]
    [InlineData(Gender.Man, InterestedIn.Men, Gender.Man, InterestedIn.Everyone, true)]
    [InlineData(Gender.NonBinary, InterestedIn.Everyone, Gender.Woman, InterestedIn.Everyone, true)]
    [InlineData(Gender.NonBinary, InterestedIn.Everyone, Gender.Woman, InterestedIn.Women, false)]
    [InlineData(Gender.Woman, InterestedIn.Men, Gender.NonBinary, InterestedIn.Everyone, false)]
    [InlineData(Gender.Woman, InterestedIn.Everyone, Gender.NonBinary, InterestedIn.Everyone, true)]
    public async Task Feed_respects_both_peoples_preferences(Gender myGender, InterestedIn myInterest,
        Gender theirGender, InterestedIn theirInterest, bool visible)
    {
        var me = await factory.CreateVisibleUserAsync(gender: myGender, interestedIn: myInterest);
        var them = await factory.CreateVisibleUserAsync(gender: theirGender, interestedIn: theirInterest);
        Assert.Equal(visible, (await me.FeedAsync()).Any(p => p.Id == them.Id));
    }

    [Fact]
    public async Task Swiped_profiles_drop_out_of_the_feed_either_way()
    {
        var me = await factory.CreateVisibleUserAsync();
        var liked = await factory.CreateVisibleUserAsync();
        var passed = await factory.CreateVisibleUserAsync();

        await me.Client.PostJsonAsync("/api/swipes", new SwipeRequest(liked.Id, true));
        await me.Client.PostJsonAsync("/api/swipes", new SwipeRequest(passed.Id, false));

        var feed = await me.FeedAsync();
        Assert.DoesNotContain(feed, p => p.Id == liked.Id);
        Assert.DoesNotContain(feed, p => p.Id == passed.Id);
    }

    [Fact]
    public async Task Each_profile_carries_its_own_confessions()
    {
        // Regression: a split query once re-randomized and attached flaws to the wrong people.
        var me = await factory.CreateVisibleUserAsync();
        var people = new List<TestUser>();
        for (var i = 0; i < 6; i++)
            people.Add(await factory.CreateUserAsync($"P{i}", flaws: [$"flaw-a of P{i}", $"flaw-b of P{i}"]));

        for (var round = 0; round < 3; round++)
        {
            foreach (var p in (await me.FeedAsync()).Where(p => p.DisplayName.StartsWith('P')))
            {
                Assert.Equal(2, p.Flaws.Count);
                Assert.All(p.Flaws, f => Assert.EndsWith($"of {p.DisplayName}", f.Text));
            }
        }
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(2, 2)]
    [InlineData(500, 50)]
    public async Task Take_is_clamped(int take, int max)
    {
        var me = await factory.CreateVisibleUserAsync();
        for (var i = 0; i < 3; i++) await factory.CreateVisibleUserAsync();
        var feed = await (await me.Client.GetAsync($"/api/feed?take={take}")).ReadAsync<List<ProfileDto>>();
        Assert.InRange(feed.Count, 1, max);
    }
}

public class SwipeTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task One_sided_like_is_not_a_match()
    {
        var a = await factory.CreateVisibleUserAsync();
        var b = await factory.CreateVisibleUserAsync();
        var r = await (await a.Client.PostJsonAsync("/api/swipes", new SwipeRequest(b.Id, true))).ReadAsync<SwipeResult>();
        Assert.False(r.IsMatch);
        Assert.Null(r.MatchId);
        Assert.Empty(await a.MatchesAsync());
    }

    [Fact]
    public async Task Mutual_likes_create_exactly_one_match_visible_to_both()
    {
        var a = await factory.CreateVisibleUserAsync("Ana");
        var b = await factory.CreateVisibleUserAsync("Bo");
        var matchId = await TestHelpers.MatchAsync(a, b);

        var aMatches = await a.MatchesAsync();
        var bMatches = await b.MatchesAsync();
        Assert.Equal(matchId, Assert.Single(aMatches).MatchId);
        Assert.Equal("Bo", aMatches[0].OtherName);
        Assert.Equal(b.Id, aMatches[0].OtherUserId);
        Assert.Equal("Ana", Assert.Single(bMatches).OtherName);
        Assert.Equal(1, await factory.WithDbAsync(db => db.Matches.CountAsync(m => m.Id == matchId)));
    }

    [Fact]
    public async Task Dealbreaker_on_either_side_means_no_match()
    {
        var a = await factory.CreateVisibleUserAsync();
        var b = await factory.CreateVisibleUserAsync();
        await a.Client.PostJsonAsync("/api/swipes", new SwipeRequest(b.Id, false));
        var r = await (await b.Client.PostJsonAsync("/api/swipes", new SwipeRequest(a.Id, true))).ReadAsync<SwipeResult>();
        Assert.False(r.IsMatch);
    }

    [Fact]
    public async Task Cannot_swipe_on_yourself()
    {
        var a = await factory.CreateVisibleUserAsync();
        Assert.Contains("yourself", await (await a.Client.PostJsonAsync("/api/swipes", new SwipeRequest(a.Id, true))).ErrorAsync());
    }

    [Fact]
    public async Task Cannot_swipe_twice_on_the_same_person()
    {
        var a = await factory.CreateVisibleUserAsync();
        var b = await factory.CreateVisibleUserAsync();
        await a.Client.PostJsonAsync("/api/swipes", new SwipeRequest(b.Id, false));
        await (await a.Client.PostJsonAsync("/api/swipes", new SwipeRequest(b.Id, true))).ErrorAsync(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Swiping_on_unknown_user_is_404()
    {
        var a = await factory.CreateVisibleUserAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await a.Client.PostJsonAsync("/api/swipes", new SwipeRequest(Guid.NewGuid(), true))).StatusCode);
    }

    [Fact]
    public async Task Demo_users_do_not_auto_like_back_outside_development()
    {
        var me = await factory.CreateVisibleUserAsync();
        var demo = await factory.CreateVisibleUserAsync("Demo");
        await factory.WithDbAsync(db => db.Users.Where(u => u.Id == demo.Id).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsDemo, true)));
        var r = await (await me.Client.PostJsonAsync("/api/swipes", new SwipeRequest(demo.Id, true))).ReadAsync<SwipeResult>();
        Assert.False(r.IsMatch);
    }
}

public class DevelopmentModeTests(DevApiFactory factory) : IClassFixture<DevApiFactory>
{
    [Fact]
    public async Task Demo_users_like_you_back_in_development()
    {
        var me = await factory.CreateVisibleUserAsync();
        var demo = await factory.CreateVisibleUserAsync("Demo");
        await factory.WithDbAsync(db => db.Users.Where(u => u.Id == demo.Id).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsDemo, true)));

        var r = await (await me.Client.PostJsonAsync("/api/swipes", new SwipeRequest(demo.Id, true))).ReadAsync<SwipeResult>();
        Assert.True(r.IsMatch);
    }

    [Fact]
    public async Task Demo_users_do_not_like_back_a_dealbreaker()
    {
        var me = await factory.CreateVisibleUserAsync();
        var demo = await factory.CreateVisibleUserAsync("Demo2");
        await factory.WithDbAsync(db => db.Users.Where(u => u.Id == demo.Id).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsDemo, true)));
        var r = await (await me.Client.PostJsonAsync("/api/swipes", new SwipeRequest(demo.Id, false))).ReadAsync<SwipeResult>();
        Assert.False(r.IsMatch);
    }

    [Fact]
    public async Task Browser_preview_origins_get_cors_headers_in_development()
    {
        var c = factory.CreateClient();
        var req = new HttpRequestMessage(HttpMethod.Options, "/api/auth/login");
        req.Headers.Add("Origin", "http://localhost:8081");
        req.Headers.Add("Access-Control-Request-Method", "POST");
        var res = await c.SendAsync(req);
        Assert.Equal("http://localhost:8081", res.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }
}
