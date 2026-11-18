using System.Net;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;

namespace Sin.Api.Tests.Integration;

/// <summary>
/// Practice accounts (an email at the practice domain): a ready-made world for trying the whole app,
/// kept completely apart from real members.
/// </summary>
public class PracticeAccountTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private Task<TestUser> PracticeAsync(string name = "Taylor", InterestedIn into = InterestedIn.Everyone) =>
        factory.CreateUnlocatedUserAsync(name, Gender.Man, into, 29, email: TestHelpers.UniqueEmail("practice").Replace("@test.app", "@ick.test"));

    private static async Task<List<MatchHistoryDto>> HistoryAsync(TestUser u) =>
        await (await u.Client.GetAsync("/api/matches/history")).ReadAsync<List<MatchHistoryDto>>();

    [Fact]
    public async Task A_practice_account_arrives_with_every_part_of_the_profile_filled_in()
    {
        var me = await PracticeAsync();

        var profile = await (await me.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Equal("Taylor", profile.DisplayName);
        Assert.False(string.IsNullOrWhiteSpace(profile.Headline));
        Assert.Equal(70, profile.HeightInches);
        Assert.NotNull(profile.Ethnicity);
        Assert.NotNull(profile.PhotoUrl);
        Assert.Equal(Enum.GetValues<FlawCategory>().Order(), profile.Flaws.Select(f => f.Category).Order()); // one of each

        var prefs = await (await me.Client.GetAsync("/api/me/preferences")).ReadAsync<PreferencesDto>();
        Assert.Equal((21, 45), (prefs.MinAge, prefs.MaxAge));

        // The placeholder picture is a real image that was stored.
        var file = profile.PhotoUrl!.Split('/').Last();
        Assert.Equal([0xFF, 0xD8, 0xFF], factory.Photos.Files[file].Take(3).Select(b => (int)b));
    }

    [Fact]
    public async Task It_has_current_matches_a_conversation_and_a_dated_history_of_ended_ones()
    {
        var me = await PracticeAsync();

        var matches = await me.MatchesAsync();
        Assert.Equal(["Maya", "Devon"], matches.Select(m => m.OtherName)); // the one with messages first
        Assert.Equal("Honestly that I can handle.", matches[0].LastMessage);
        Assert.Null(matches[1].LastMessage);

        var chat = await (await me.Client.GetAsync($"/api/matches/{matches[0].MatchId}/messages")).ReadAsync<List<MessageDto>>();
        Assert.Equal(6, chat.Count);
        Assert.Equal(3, chat.Count(m => m.SenderId == me.Id));
        Assert.Equal(chat.Select(m => m.SentAt).Order(), chat.Select(m => m.SentAt));
        // The conversation still works.
        await (await me.Client.PostJsonAsync($"/api/matches/{matches[0].MatchId}/messages", new SendMessageRequest("Still here."))).ReadAsync<MessageDto>();

        var history = await HistoryAsync(me);
        Assert.Equal(["Devon", "Maya", "Sasha", "Elliot", "Brooke", null], history.Select(h => h.OtherName)); // newest activity first
        Assert.Equal([false, false, true, true, true, true], history.Select(h => h.EndedAt is not null));
        Assert.Equal([true, false, true, false], history.Skip(2).Select(h => h.EndedByMe)); // blocked, they left, I unmatched, account gone

        // Spread over months, not all stamped with the moment the account was made.
        var oldest = history.Min(h => h.MatchedAt);
        Assert.InRange(oldest, DateTime.UtcNow.AddDays(-90), DateTime.UtcNow.AddDays(-80));
        Assert.All(history.Where(h => h.EndedAt is not null), h => Assert.True(h.EndedAt > h.MatchedAt));
        Assert.Equal(history.Count, history.Select(h => h.MatchedAt.Date).Distinct().Count());
        Assert.InRange(history.Single(h => h.OtherName == "Maya").MatchedAt, DateTime.UtcNow.AddDays(-14), DateTime.UtcNow.AddDays(-12));
    }

    [Fact]
    public async Task Discover_works_straight_away_and_two_people_have_already_said_yes()
    {
        var me = await PracticeAsync();

        // No location needed first: the account starts out placed in the US.
        var feed = await me.FeedAsync();
        Assert.Equal(["Harper", "Imani", "Jo", "Nico", "Wes"], feed.Select(p => p.DisplayName).Order());
        Assert.All(feed, p => Assert.NotEmpty(p.Flaws));
        Assert.Equal(5, feed.Single(p => p.DisplayName == "Harper").DistanceMiles);
        Assert.Equal(320, feed.Single(p => p.DisplayName == "Wes").DistanceMiles!.Value, tolerance: 4);

        // Filters bite: within 30 miles, then with the age limit lifted.
        await me.SetPreferencesAsync(new PreferencesDto(21, 45, 30));
        Assert.Equal(["Harper", "Jo", "Nico"], (await me.FeedAsync()).Select(p => p.DisplayName).Order());
        await me.SetPreferencesAsync(new PreferencesDto());
        Assert.Contains("Theo", (await me.FeedAsync()).Select(p => p.DisplayName)); // 52: outside the starting 21-45

        async Task<SwipeResult> SwipeRightAsync(string name) =>
            await (await me.Client.PostJsonAsync("/api/swipes", new SwipeRequest(feed.Single(p => p.DisplayName == name).Id, true))).ReadAsync<SwipeResult>();

        Assert.True((await SwipeRightAsync("Harper")).IsMatch);
        Assert.True((await SwipeRightAsync("Jo")).IsMatch);
        Assert.False((await SwipeRightAsync("Nico")).IsMatch);
        Assert.Equal(4, (await me.MatchesAsync()).Count);
    }

    [Theory]
    [InlineData(InterestedIn.Women, Gender.Woman)]
    [InlineData(InterestedIn.Men, Gender.Man)]
    public async Task The_made_up_people_are_whoever_the_tester_is_looking_for(InterestedIn into, Gender expected)
    {
        var me = await PracticeAsync("Picky", into);
        var feed = await me.FeedAsync();
        Assert.Equal(5, feed.Count);
        Assert.All(feed, p => Assert.Equal(expected, p.Gender));
    }

    [Fact]
    public async Task Real_members_and_practice_accounts_never_come_across_each_other()
    {
        var real = await factory.CreateVisibleUserAsync("RealPerson");
        var otherReal = await factory.CreateVisibleUserAsync("OtherReal");
        var me = await PracticeAsync();
        var another = await PracticeAsync("Second");

        var realFeed = (await real.FeedAsync()).Select(p => p.DisplayName).ToList();
        Assert.Contains("OtherReal", realFeed);
        Assert.DoesNotContain(realFeed, n => n is "Taylor" or "Second" or "Harper" or "Nico" or "Maya");

        var myFeed = await me.FeedAsync();
        Assert.DoesNotContain(myFeed, p => p.DisplayName is "RealPerson" or "OtherReal" or "Second");

        // Each practice account has its own copy of the cast.
        var theirFeed = await another.FeedAsync();
        Assert.Empty(myFeed.Select(p => p.Id).Intersect(theirFeed.Select(p => p.Id)));

        // Knowing an id doesn't get you across the line, in either direction.
        var harper = myFeed.Single(p => p.DisplayName == "Harper").Id;
        Assert.Equal(HttpStatusCode.NotFound, (await real.Client.PostJsonAsync("/api/swipes", new SwipeRequest(harper, true))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await real.Client.PostJsonAsync("/api/swipes", new SwipeRequest(me.Id, true))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await me.Client.PostJsonAsync("/api/swipes", new SwipeRequest(real.Id, true))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await another.Client.PostJsonAsync("/api/swipes", new SwipeRequest(harper, true))).StatusCode);
    }

    [Fact]
    public async Task The_made_up_people_cannot_sign_in()
    {
        await PracticeAsync();
        var emails = await factory.WithDbAsync(db => db.Users.Where(u => u.PracticeOwnerId != null).Select(u => u.Email).Take(3).ToListAsync());
        Assert.NotEmpty(emails);
        foreach (var email in emails)
        {
            var res = await factory.CreateClient().PostJsonAsync("/api/auth/login", new LoginRequest(email, "password123"));
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        }
    }

    [Fact]
    public async Task The_world_follows_the_phone_and_works_outside_the_us()
    {
        var me = await PracticeAsync();

        await me.LocateAsync(TestHelpers.LosAngeles);
        var feed = await me.FeedAsync();
        Assert.Equal(5, feed.Single(p => p.DisplayName == "Harper").DistanceMiles); // still five miles away, now in LA
        Assert.Equal(27, feed.Single(p => p.DisplayName == "Nico").DistanceMiles!.Value, tolerance: 1);

        // A tester (or a store reviewer) abroad isn't locked out: there are only made-up people to meet.
        await me.LocateAsync(TestHelpers.London);
        Assert.Equal(5, (await me.FeedAsync()).Count);
    }

    [Fact]
    public async Task Deleting_a_practice_account_removes_its_whole_world()
    {
        var me = await PracticeAsync();
        var keep = await PracticeAsync("Keeper");
        var feed = await me.FeedAsync();
        await me.Client.PostJsonAsync("/api/swipes", new SwipeRequest(feed.Single(p => p.DisplayName == "Harper").Id, true));
        await me.Client.DeleteAsync($"/api/matches/{(await me.MatchesAsync()).First(m => m.OtherName == "Devon").MatchId}");
        var photosBefore = factory.Photos.Files.Count;

        Assert.Equal(HttpStatusCode.NoContent, (await me.Client.DeleteAsync("/api/me")).StatusCode);

        await factory.WithDbAsync(async db =>
        {
            Assert.Equal(0, await db.Users.CountAsync(u => u.Id == me.Id || u.PracticeOwnerId == me.Id));
            var gone = db.Users.Select(u => u.Id);
            Assert.Equal(0, await db.Swipes.CountAsync(s => !gone.Contains(s.SwiperId) || !gone.Contains(s.TargetId)));
            Assert.Equal(0, await db.Matches.CountAsync(m => !gone.Contains(m.UserAId) || !gone.Contains(m.UserBId)));
            Assert.Equal(0, await db.PastMatches.CountAsync(p => !gone.Contains(p.UserId)));
            Assert.Equal(0, await db.Blocks.CountAsync(b => !gone.Contains(b.BlockerId)));
            Assert.Equal(0, await db.Flaws.CountAsync(f => !gone.Contains(f.UserId)));
        });
        Assert.Equal(photosBefore - 5, factory.Photos.Files.Count); // the tester's picture and the four the cast had

        // The other practice account is untouched.
        Assert.Equal(5, (await keep.FeedAsync()).Count);
        Assert.Equal(6, (await HistoryAsync(keep)).Count);
    }

    [Fact]
    public async Task An_ordinary_email_gets_an_ordinary_empty_account()
    {
        var real = await factory.CreateUnlocatedUserAsync("Plain");
        var profile = await (await real.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Null(profile.Headline);
        Assert.Null(profile.PhotoUrl);
        Assert.Empty(profile.Flaws);
        Assert.Empty(await real.MatchesAsync());
        Assert.Equal(0, await factory.WithDbAsync(db => db.Users.CountAsync(u => u.PracticeOwnerId == real.Id)));
    }
}

/// <summary>Only so many practice accounts at once.</summary>
public class PracticeAccountLimitTests(PracticeAccountLimitTests.OneOnlyFactory factory) : IClassFixture<PracticeAccountLimitTests.OneOnlyFactory>
{
    public class OneOnlyFactory : ApiFactory
    {
        protected override IDictionary<string, string?> Overrides => new Dictionary<string, string?> { ["Practice:MaxAccounts"] = "1" };
    }

    [Fact]
    public async Task Registration_is_refused_once_the_practice_accounts_are_used_up_until_one_is_deleted()
    {
        RegisterRequest Request(string email) => new(email, "password123", "Taylor", 29, Gender.Man, InterestedIn.Everyone);

        var first = await factory.CreateUnlocatedUserAsync("First", email: "first@ick.test");
        var refused = await factory.CreateClient().PostJsonAsync("/api/auth/register", Request("second@ick.test"));
        Assert.Contains("practice accounts", await refused.ErrorAsync(HttpStatusCode.Conflict));
        Assert.Equal(0, await factory.WithDbAsync(db => db.Users.CountAsync(u => u.Email == "second@ick.test")));

        // The made-up people don't count towards the limit, and real sign-ups are unaffected.
        await factory.CreateUnlocatedUserAsync("Real");

        await first.Client.DeleteAsync("/api/me");
        await (await factory.CreateClient().PostJsonAsync("/api/auth/register", Request("second@ick.test"))).ReadAsync<SignUpResponse>();
    }
}

/// <summary>With no practice domain configured the feature doesn't exist.</summary>
public class PracticeAccountsOffTests(PracticeAccountsOffTests.OffFactory factory) : IClassFixture<PracticeAccountsOffTests.OffFactory>
{
    public class OffFactory : ApiFactory
    {
        protected override IDictionary<string, string?> Overrides => new Dictionary<string, string?> { ["Practice:EmailDomain"] = "" };
    }

    [Fact]
    public async Task The_same_email_is_then_just_a_normal_account()
    {
        var user = await factory.CreateUnlocatedUserAsync("Normal", email: "someone@ick.test", flaws: "I leave one sip in every glass.");
        await user.LocateAsync(TestHelpers.NewYork);
        var other = await factory.CreateVisibleUserAsync("Other");

        Assert.Empty(await user.MatchesAsync());
        Assert.Contains("Other", (await user.FeedAsync()).Select(p => p.DisplayName));
        Assert.Contains("Normal", (await other.FeedAsync()).Select(p => p.DisplayName));
    }
}
