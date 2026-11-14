using System.Net;
using System.Net.Http.Headers;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Services;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;

namespace Sin.Api.Tests.Integration;

/// <summary>The AI screen for porn and gore, with the AI itself replaced by a fake that returns chosen verdicts.</summary>
public class ModerationTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public ModerationTests(ApiFactory factory)
    {
        _factory = factory;
        _factory.Moderator.Reset();
    }

    [Fact]
    public async Task Blocked_photo_is_rejected_and_never_stored()
    {
        var u = await _factory.CreateUserAsync();
        var before = _factory.Photos.Files.Count;
        _factory.Moderator.PhotoVerdict = ModerationResult.Blocked("sexual", "Explicit nudity.");

        var error = await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/jpeg"))).ErrorAsync();

        Assert.Contains("nudity", error);
        Assert.DoesNotContain("Explicit nudity.", error); // the model's reasoning stays in the log
        Assert.Equal(before, _factory.Photos.Files.Count);
        Assert.Null((await (await u.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>()).PhotoUrl);
    }

    [Fact]
    public async Task Blocked_photo_leaves_the_current_photo_in_place()
    {
        var u = await _factory.CreateUserAsync();
        var first = await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/jpeg"))).ReadAsync<PhotoUploadResponse>();
        _factory.Moderator.PhotoVerdict = ModerationResult.Blocked("gore");

        await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/png"))).ErrorAsync();

        Assert.True(_factory.Photos.Files.ContainsKey(first.PhotoUrl.Split('/')[^1]));
        Assert.Equal(first.PhotoUrl, (await (await u.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>()).PhotoUrl);
    }

    [Fact]
    public async Task Photo_is_refused_while_the_moderator_is_unavailable()
    {
        var u = await _factory.CreateUserAsync();
        var before = _factory.Photos.Files.Count;
        _factory.Moderator.PhotoVerdict = ModerationResult.Unavailable;

        var error = await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/jpeg"))).ErrorAsync(HttpStatusCode.ServiceUnavailable);

        Assert.Contains("Try again", error);
        Assert.Equal(before, _factory.Photos.Files.Count);
    }

    [Fact]
    public async Task Moderator_sees_the_cleaned_photo_at_reduced_size()
    {
        var u = await _factory.CreateUserAsync();
        await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/jpeg", 3200, 1600, withGps: true))).ReadAsync<PhotoUploadResponse>();

        using var seen = new ImageMagick.MagickImage(Assert.Single(_factory.Moderator.PhotosChecked));
        Assert.Equal((PhotoProcessor.ModerationDimension, PhotoProcessor.ModerationDimension / 2), (seen.Width, seen.Height));
        Assert.Null(seen.GetExifProfile()); // location never leaves the server
    }

    [Fact]
    public async Task Files_that_are_not_photos_never_reach_the_moderator()
    {
        var u = await _factory.CreateUserAsync();
        var junk = new ByteArrayContent(new byte[100]);
        junk.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");

        await (await u.Client.PostAsync("/api/me/photo", new MultipartFormDataContent { { junk, "file", "photo" } })).ErrorAsync();

        Assert.Empty(_factory.Moderator.PhotosChecked);
    }

    [Fact]
    public async Task Blocked_confession_is_rejected()
    {
        var u = await _factory.CreateUserAsync();
        _factory.Moderator.TextVerdict = t => t.Contains("graphic") ? ModerationResult.Blocked("sexual") : ModerationResult.Allowed;

        var error = await (await u.Client.PostJsonAsync("/api/me/flaws", new CreateFlawRequest(FlawCategory.Habits, "Something graphic."))).ErrorAsync();
        Assert.Contains("too graphic", error);

        await (await u.Client.PostJsonAsync("/api/me/flaws", new CreateFlawRequest(FlawCategory.Habits, "I chew ice loudly."))).ReadAsync<FlawDto>();
        var me = await (await u.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Equal("I chew ice loudly.", Assert.Single(me.Flaws).Text);
    }

    [Fact]
    public async Task Confessions_still_work_while_the_moderator_is_unavailable()
    {
        var u = await _factory.CreateUserAsync();
        _factory.Moderator.TextVerdict = _ => ModerationResult.Unavailable;

        await (await u.Client.PostJsonAsync("/api/me/flaws", new CreateFlawRequest(FlawCategory.Habits, "I narrate my own chores."))).ReadAsync<FlawDto>();
    }

    [Fact]
    public async Task Word_filter_runs_first_so_abuse_never_costs_an_ai_call()
    {
        var u = await _factory.CreateUserAsync();
        _factory.Moderator.Reset();

        await (await u.Client.PostJsonAsync("/api/me/flaws", new CreateFlawRequest(FlawCategory.Temper, "I tell people to kys."))).ErrorAsync();

        Assert.Empty(_factory.Moderator.TextsChecked);
    }

    [Fact]
    public async Task Blocked_headline_is_rejected_and_the_profile_is_unchanged()
    {
        var u = await _factory.CreateUserAsync("Bo", Gender.Man, InterestedIn.Women, 33);
        _factory.Moderator.TextVerdict = t => t.Contains("graphic") ? ModerationResult.Blocked("gore") : ModerationResult.Allowed;

        var error = await (await u.Client.PutJsonAsync("/api/me",
            new UpdateProfileRequest("Bo", 33, Gender.Man, InterestedIn.Women, "A graphic headline."))).ErrorAsync();

        Assert.Contains("too graphic", error);
        Assert.Null((await (await u.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>()).Headline);
    }

    [Fact]
    public async Task Profile_text_is_only_checked_when_it_changes()
    {
        var u = await _factory.CreateUserAsync("Cy", Gender.Man, InterestedIn.Women, 33);
        _factory.Moderator.Reset();

        // Same name and (empty) headline, different preferences: nothing new to screen.
        await (await u.Client.PutJsonAsync("/api/me", new UpdateProfileRequest("Cy", 33, Gender.Man, InterestedIn.Everyone, null))).ReadAsync<ProfileDto>();
        Assert.Empty(_factory.Moderator.TextsChecked);

        await (await u.Client.PutJsonAsync("/api/me", new UpdateProfileRequest("Cy", 33, Gender.Man, InterestedIn.Everyone, "I reply-all."))).ReadAsync<ProfileDto>();
        var (kind, text) = Assert.Single(_factory.Moderator.TextsChecked);
        Assert.Equal("display name and headline", kind);
        Assert.Contains("Cy", text);
        Assert.Contains("I reply-all.", text);
    }

    [Fact]
    public async Task Sexual_content_involving_a_minor_files_a_report_for_moderators()
    {
        var u = await _factory.CreateUserAsync();
        _factory.Moderator.PhotoVerdict = ModerationResult.Blocked("minors", "Appears to show a child.");

        await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/jpeg"))).ErrorAsync();

        var reports = await (await _factory.AdminClient().GetAsync("/api/admin/reports")).ReadAsync<List<ReportDto>>();
        var report = Assert.Single(reports, r => r.ReportedId == u.Id);
        Assert.Equal(Guid.Empty, report.ReporterId);
        Assert.Equal(ReportReason.Underage, report.Reason);
        Assert.Contains("Automatic", report.Details);
    }

    [Fact]
    public async Task Ordinary_blocks_do_not_file_reports()
    {
        var u = await _factory.CreateUserAsync();
        _factory.Moderator.PhotoVerdict = ModerationResult.Blocked("sexual");

        await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/jpeg"))).ErrorAsync();

        Assert.False(await _factory.WithDbAsync(db => db.Reports.AnyAsync(r => r.ReportedId == u.Id)));
    }
}
