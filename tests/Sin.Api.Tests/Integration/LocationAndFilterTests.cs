using System.Net;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;
using static Sin.Api.Tests.Infrastructure.TestHelpers;

namespace Sin.Api.Tests.Integration;

/// <summary>Ick is US-only: nobody browses, is shown, or is swiped on without a US location.</summary>
public class LocationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Flaw = "I leave one sip in every glass.";

    [Fact]
    public async Task Without_a_location_you_cannot_browse_or_swipe()
    {
        var newcomer = await factory.CreateUnlocatedUserAsync(flaws: Flaw);
        var someone = await factory.CreateVisibleUserAsync();

        Assert.Equal(ErrorCodes.LocationRequired, await (await newcomer.Client.GetAsync("/api/feed")).ErrorCodeAsync());
        Assert.Equal(ErrorCodes.LocationRequired,
            await (await newcomer.Client.PostJsonAsync("/api/swipes", new SwipeRequest(someone.Id, true))).ErrorCodeAsync());
    }

    [Fact]
    public async Task Sharing_a_US_location_lets_you_in_and_is_stored_only_roughly()
    {
        var me = await factory.CreateUnlocatedUserAsync(flaws: Flaw);
        var res = await me.Client.PutJsonAsync("/api/me/location", new LocationRequest(40.712776, -74.005974, "US"));
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);

        await me.FeedAsync(); // no longer refused
        var saved = await factory.WithDbAsync(db => db.Users.SingleAsync(u => u.Id == me.Id));
        Assert.Equal(40.71, saved.Latitude);
        Assert.Equal(-74.01, saved.Longitude);
        Assert.NotNull(saved.LocatedAt);
    }

    [Fact]
    public async Task People_without_a_location_are_hidden_and_cannot_be_swiped_on()
    {
        var me = await factory.CreateVisibleUserAsync();
        var unknown = await factory.CreateUnlocatedUserAsync(flaws: Flaw);

        Assert.DoesNotContain(await me.FeedAsync(), p => p.Id == unknown.Id);
        Assert.Equal(HttpStatusCode.NotFound,
            (await me.Client.PostJsonAsync("/api/swipes", new SwipeRequest(unknown.Id, true))).StatusCode);
    }

    [Fact]
    public async Task Leaving_the_US_takes_you_out_of_discover()
    {
        var me = await factory.CreateVisibleUserAsync();
        var traveller = await factory.CreateVisibleUserAsync("Traveller");
        Assert.Contains(await me.FeedAsync(), p => p.Id == traveller.Id);

        var res = await traveller.Client.PutJsonAsync("/api/me/location", London);
        Assert.Equal(ErrorCodes.OutsideUs, await res.ErrorCodeAsync());

        Assert.DoesNotContain(await me.FeedAsync(), p => p.Id == traveller.Id);
        Assert.Equal(ErrorCodes.LocationRequired, await (await traveller.Client.GetAsync("/api/feed")).ErrorCodeAsync());

        // ...and coming home brings them back.
        await traveller.LocateAsync(LosAngeles);
        Assert.Contains(await me.FeedAsync(), p => p.Id == traveller.Id);
    }

    public static TheoryData<double, double, string?, bool> Places => new()
    {
        { 40.7128, -74.0060, "US", true },     // New York
        { 61.2181, -149.9003, "US", true },    // Anchorage
        { 21.3069, -157.8583, "US", true },    // Honolulu
        { 18.4655, -66.1057, "PR", true },     // San Juan, Puerto Rico
        { 13.4443, 144.7937, "GU", true },     // Guam
        { 47.6062, -122.3321, null, true },    // Seattle, phone couldn't name the country
        { 43.6532, -79.3832, "CA", false },    // Toronto: inside the rough rectangle, but Canada
        { 32.5149, -117.0382, "MX", false },   // Tijuana
        { 51.5074, -0.1278, "GB", false },     // London
        { 48.8566, 2.3522, "US", false },      // Paris, with a phone claiming it's the US
        { 19.4326, -99.1332, null, false },    // Mexico City, no country
        { 0, 0, null, false },
    };

    [Theory]
    [MemberData(nameof(Places))]
    public async Task Only_US_locations_are_accepted(double lat, double lng, string? country, bool accepted)
    {
        var me = await factory.CreateUnlocatedUserAsync();
        var res = await me.Client.PutJsonAsync("/api/me/location", new LocationRequest(lat, lng, country));
        Assert.Equal(accepted ? HttpStatusCode.NoContent : HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Location_needs_a_signed_in_user()
    {
        var res = await factory.CreateClient().PutJsonAsync("/api/me/location", NewYork);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}

public class ReviewerBypassFactory : ApiFactory
{
    public const string ReviewerEmail = "reviewer@test.app";
    protected override IDictionary<string, string?> Overrides => new Dictionary<string, string?>
    {
        ["Location:BypassEmails"] = $"someone-else@test.app, {ReviewerEmail.ToUpperInvariant()}",
    };
}

/// <summary>The store reviewers' test login works from anywhere, even with location switched off.</summary>
public class ReviewerBypassTests(ReviewerBypassFactory factory) : IClassFixture<ReviewerBypassFactory>
{
    [Fact]
    public async Task Reviewer_account_gets_in_without_a_US_location_and_nobody_else_does()
    {
        var local = await factory.CreateVisibleUserAsync("Local");
        var reviewer = await factory.CreateUnlocatedUserAsync("Reviewer", email: ReviewerBypassFactory.ReviewerEmail,
            flaws: "I review apps for a living.");
        var ordinary = await factory.CreateUnlocatedUserAsync("Ordinary");

        // Never shared a location at all: still gets a feed, and can swipe.
        Assert.Contains(await reviewer.FeedAsync(), p => p.Id == local.Id);
        await (await reviewer.Client.PostJsonAsync("/api/swipes", new SwipeRequest(local.Id, true))).ReadAsync<SwipeResult>();

        // Shares one from abroad: accepted, and they stay where they were put.
        Assert.Equal(HttpStatusCode.NoContent, (await reviewer.Client.PutJsonAsync("/api/me/location", London)).StatusCode);
        Assert.Contains(await local.FeedAsync(), p => p.Id == reviewer.Id);

        Assert.Equal(ErrorCodes.LocationRequired, await (await ordinary.Client.GetAsync("/api/feed")).ErrorCodeAsync());
        Assert.Equal(ErrorCodes.OutsideUs, await (await ordinary.Client.PutJsonAsync("/api/me/location", London)).ErrorCodeAsync());
    }
}

public class FilterTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private async Task<List<Guid>> SeenAsync(TestUser me) => (await me.FeedAsync()).Select(p => p.Id).ToList();

    [Fact]
    public async Task Filters_start_wide_open()
    {
        var me = await factory.CreateVisibleUserAsync();
        var prefs = await (await me.Client.GetAsync("/api/me/preferences")).ReadAsync<PreferencesDto>();
        Assert.Equal(new PreferencesDto(18, null, null, null, null, []) with { Ethnicities = null }, prefs with { Ethnicities = null });
        Assert.Empty(prefs.Ethnicities!);
    }

    [Fact]
    public async Task Age_range_is_respected()
    {
        var me = await factory.CreateVisibleUserAsync();
        var young = await factory.CreateUserAsync("Young", age: 22, flaws: "flaw");
        var middle = await factory.CreateUserAsync("Middle", age: 34, flaws: "flaw");
        var older = await factory.CreateUserAsync("Older", age: 51, flaws: "flaw");

        var saved = await me.SetPreferencesAsync(new PreferencesDto(MinAge: 30, MaxAge: 40));
        Assert.Equal((30, 40), (saved.MinAge, saved.MaxAge));
        var seen = await SeenAsync(me);
        Assert.Contains(middle.Id, seen);
        Assert.DoesNotContain(young.Id, seen);
        Assert.DoesNotContain(older.Id, seen);

        // No upper limit.
        await me.SetPreferencesAsync(new PreferencesDto(MinAge: 30));
        seen = await SeenAsync(me);
        Assert.Contains(older.Id, seen);
        Assert.DoesNotContain(young.Id, seen);
    }

    [Fact]
    public async Task Height_filter_only_shows_people_who_gave_a_height_in_range()
    {
        var me = await factory.CreateVisibleUserAsync();
        var shortish = await factory.CreateVisibleUserAsync("Short");
        var tall = await factory.CreateVisibleUserAsync("Tall");
        var unsaid = await factory.CreateVisibleUserAsync("Unsaid");
        await factory.DescribeAsync(shortish, height: 62);
        await factory.DescribeAsync(tall, height: 74);

        // No filter: everyone, and heights are shown.
        var feed = await me.FeedAsync();
        Assert.Equal(74, feed.Single(p => p.Id == tall.Id).HeightInches);
        Assert.Null(feed.Single(p => p.Id == unsaid.Id).HeightInches);

        await me.SetPreferencesAsync(new PreferencesDto(MinHeightInches: 70));
        var seen = await SeenAsync(me);
        Assert.Contains(tall.Id, seen);
        Assert.DoesNotContain(shortish.Id, seen);
        Assert.DoesNotContain(unsaid.Id, seen);

        await me.SetPreferencesAsync(new PreferencesDto(MinHeightInches: 60, MaxHeightInches: 66));
        seen = await SeenAsync(me);
        Assert.Contains(shortish.Id, seen);
        Assert.DoesNotContain(tall.Id, seen);
    }

    [Fact]
    public async Task Ethnicity_filter_shows_only_the_chosen_ones_and_never_reveals_it()
    {
        var me = await factory.CreateVisibleUserAsync();
        var a = await factory.CreateVisibleUserAsync("A");
        var b = await factory.CreateVisibleUserAsync("B");
        var c = await factory.CreateVisibleUserAsync("C");
        var unsaid = await factory.CreateVisibleUserAsync("Unsaid");
        await factory.DescribeAsync(a, ethnicity: Ethnicity.Asian);
        await factory.DescribeAsync(b, ethnicity: Ethnicity.Black);
        await factory.DescribeAsync(c, ethnicity: Ethnicity.HispanicLatino);

        var saved = await me.SetPreferencesAsync(new PreferencesDto(Ethnicities: [Ethnicity.Black, Ethnicity.Asian, Ethnicity.Black]));
        Assert.Equal([Ethnicity.Asian, Ethnicity.Black], saved.Ethnicities);

        var feed = await me.FeedAsync();
        Assert.Contains(feed, p => p.Id == a.Id);
        Assert.Contains(feed, p => p.Id == b.Id);
        Assert.DoesNotContain(feed, p => p.Id == c.Id);
        Assert.DoesNotContain(feed, p => p.Id == unsaid.Id);
        Assert.All(feed, p => Assert.Null(p.Ethnicity)); // used for filtering, never sent to other people

        // Choosing every option is the same as choosing none.
        saved = await me.SetPreferencesAsync(new PreferencesDto(Ethnicities: [.. Enum.GetValues<Ethnicity>()]));
        Assert.Empty(saved.Ethnicities!);
        Assert.Contains(unsaid.Id, await SeenAsync(me));
    }

    [Fact]
    public async Task Distance_filter_keeps_it_local_and_cards_say_how_far()
    {
        var me = await factory.CreateVisibleUserAsync();
        var neighbour = await factory.CreateVisibleUserAsync("Neighbour");
        var philly = await factory.CreateVisibleUserAsync("Philly");
        var la = await factory.CreateVisibleUserAsync("LA");
        await philly.LocateAsync(Philadelphia);
        await la.LocateAsync(LosAngeles);

        // Anywhere in the US by default.
        var feed = await me.FeedAsync();
        Assert.Equal(1, feed.Single(p => p.Id == neighbour.Id).DistanceMiles);
        Assert.InRange(feed.Single(p => p.Id == philly.Id).DistanceMiles!.Value, 75, 85);
        Assert.InRange(feed.Single(p => p.Id == la.Id).DistanceMiles!.Value, 2400, 2500);

        await me.SetPreferencesAsync(new PreferencesDto(MaxDistanceMiles: 100));
        var seen = await SeenAsync(me);
        Assert.Contains(neighbour.Id, seen);
        Assert.Contains(philly.Id, seen);
        Assert.DoesNotContain(la.Id, seen);

        await me.SetPreferencesAsync(new PreferencesDto(MaxDistanceMiles: 25));
        seen = await SeenAsync(me);
        Assert.Contains(neighbour.Id, seen);
        Assert.DoesNotContain(philly.Id, seen);
    }

    [Fact]
    public async Task Filters_combine_and_persist()
    {
        var me = await factory.CreateVisibleUserAsync();
        var match = await factory.CreateUserAsync("Match", age: 28, flaws: "flaw");
        var wrongAge = await factory.CreateUserAsync("WrongAge", age: 45, flaws: "flaw");
        var wrongHeight = await factory.CreateUserAsync("WrongHeight", age: 28, flaws: "flaw");
        await factory.DescribeAsync(match, height: 68, ethnicity: Ethnicity.White);
        await factory.DescribeAsync(wrongAge, height: 68, ethnicity: Ethnicity.White);
        await factory.DescribeAsync(wrongHeight, height: 60, ethnicity: Ethnicity.White);

        var wanted = new PreferencesDto(25, 35, 50, 66, 72, [Ethnicity.White]);
        await me.SetPreferencesAsync(wanted);

        var reloaded = await (await me.Client.GetAsync("/api/me/preferences")).ReadAsync<PreferencesDto>();
        Assert.Equal(wanted with { Ethnicities = null }, reloaded with { Ethnicities = null });
        Assert.Equal([Ethnicity.White], reloaded.Ethnicities);

        var seen = await SeenAsync(me);
        Assert.Contains(match.Id, seen);
        Assert.DoesNotContain(wrongAge.Id, seen);
        Assert.DoesNotContain(wrongHeight.Id, seen);
    }

    public static TheoryData<PreferencesDto, string> InvalidPreferences => new()
    {
        { new PreferencesDto(MinAge: 17), "start at 18" },
        { new PreferencesDto(MinAge: 40, MaxAge: 30), "oldest" },
        { new PreferencesDto(MaxAge: 500), "oldest" },
        { new PreferencesDto(MaxDistanceMiles: 0), "distance" },
        { new PreferencesDto(MinHeightInches: 10), "height" },
        { new PreferencesDto(MaxHeightInches: 200), "height" },
        { new PreferencesDto(MinHeightInches: 72, MaxHeightInches: 60), "tallest" },
        { new PreferencesDto(Ethnicities: [(Ethnicity)99]), "listed" },
    };

    [Theory]
    [MemberData(nameof(InvalidPreferences))]
    public async Task Preferences_are_validated(PreferencesDto prefs, string expected)
    {
        var me = await factory.CreateVisibleUserAsync();
        var error = await (await me.Client.PutJsonAsync("/api/me/preferences", prefs)).ErrorAsync();
        Assert.Contains(expected, error);
    }

    [Fact]
    public async Task Height_and_ethnicity_are_optional_parts_of_your_own_profile()
    {
        var me = await factory.CreateVisibleUserAsync("Mine");
        var update = new UpdateProfileRequest("Mine", 30, Gender.Woman, InterestedIn.Everyone, null, 67, Ethnicity.Multiracial);
        var saved = await (await me.Client.PutJsonAsync("/api/me", update)).ReadAsync<ProfileDto>();
        Assert.Equal((67, Ethnicity.Multiracial), (saved.HeightInches, saved.Ethnicity));
        Assert.Null(saved.DistanceMiles);

        var reloaded = await (await me.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Equal((67, Ethnicity.Multiracial), (reloaded.HeightInches, reloaded.Ethnicity));

        // Both can be taken back off.
        var cleared = await (await me.Client.PutJsonAsync("/api/me", update with { HeightInches = null, Ethnicity = null })).ReadAsync<ProfileDto>();
        Assert.Null(cleared.HeightInches);
        Assert.Null(cleared.Ethnicity);

        Assert.Contains("height", await (await me.Client.PutJsonAsync("/api/me", update with { HeightInches = 20 })).ErrorAsync());
    }
}

/// <summary>Databases created before a column existed get it added on startup.</summary>
public class SchemaUpgradeTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Missing_columns_are_added_to_an_existing_database()
    {
        var before = await factory.CreateVisibleUserAsync("Before");
        await factory.WithDbAsync(async db =>
        {
            Assert.Empty(SchemaUpgrade.AddMissingColumns(db)); // freshly created: nothing to do

            // Turn it into an "old" database.
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" DROP COLUMN \"HeightInches\"");
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" DROP COLUMN \"PrefEthnicities\"");

            Assert.Equal(["Users.HeightInches", "Users.PrefEthnicities"], SchemaUpgrade.AddMissingColumns(db).Order());
            Assert.Empty(SchemaUpgrade.AddMissingColumns(db));
        });

        // Old rows read back with the new columns empty, and new values save.
        var me = await (await before.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Null(me.HeightInches);
        var saved = await (await before.Client.PutJsonAsync("/api/me",
            new UpdateProfileRequest("Before", 30, Gender.Woman, InterestedIn.Everyone, null, 70))).ReadAsync<ProfileDto>();
        Assert.Equal(70, saved.HeightInches);
    }
}
