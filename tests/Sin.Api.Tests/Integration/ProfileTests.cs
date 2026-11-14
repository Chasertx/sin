using System.Net;
using System.Net.Http.Headers;
using Sin.Api.Tests.Infrastructure;
using Sin.Shared;

namespace Sin.Api.Tests.Integration;

public class ProfileTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task New_profile_has_no_flaws_photo_or_headline()
    {
        var u = await factory.CreateUserAsync("Nia", Gender.NonBinary, InterestedIn.Women, 41);
        var me = await (await u.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();

        Assert.Equal(("Nia", 41, Gender.NonBinary, InterestedIn.Women), (me.DisplayName, me.Age, me.Gender, me.InterestedIn));
        Assert.Empty(me.Flaws);
        Assert.Null(me.PhotoUrl);
        Assert.Null(me.Headline);
    }

    [Fact]
    public async Task Update_profile_saves_all_fields_and_trims()
    {
        var u = await factory.CreateUserAsync();
        var updated = await (await u.Client.PutJsonAsync("/api/me",
            new UpdateProfileRequest("  Renamed ", 33, Gender.Man, InterestedIn.Men, "  I clap when planes land. "))).ReadAsync<ProfileDto>();

        Assert.Equal("Renamed", updated.DisplayName);
        Assert.Equal(33, updated.Age);
        Assert.Equal(Gender.Man, updated.Gender);
        Assert.Equal(InterestedIn.Men, updated.InterestedIn);
        Assert.Equal("I clap when planes land.", updated.Headline);

        var reloaded = await (await u.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Equal(updated, reloaded with { Flaws = updated.Flaws });
    }

    [Fact]
    public async Task Blank_headline_is_stored_as_null()
    {
        var u = await factory.CreateUserAsync();
        var p = await (await u.Client.PutJsonAsync("/api/me", new UpdateProfileRequest("A", 30, Gender.Woman, InterestedIn.Everyone, "   "))).ReadAsync<ProfileDto>();
        Assert.Null(p.Headline);
    }

    public static TheoryData<UpdateProfileRequest, string> InvalidUpdates => new()
    {
        { new("", 30, Gender.Woman, InterestedIn.Everyone, null), "Display name" },
        { new("Ok", 17, Gender.Woman, InterestedIn.Everyone, null), "18" },
        { new("Ok", 30, Gender.Woman, InterestedIn.Everyone, new string('x', Limits.HeadlineMaxLength + 1)), "Headline" },
        { new("Ok", 30, Gender.Woman, InterestedIn.Everyone, "I love to travel"), "compliment" },
        { new("Ok", 30, Gender.Woman, InterestedIn.Everyone, "kys lol"), "crosses the line" },
        { new("slut", 30, Gender.Woman, InterestedIn.Everyone, null), "crosses the line" },
    };

    [Theory]
    [MemberData(nameof(InvalidUpdates))]
    public async Task Update_profile_validates(UpdateProfileRequest req, string expected)
    {
        var u = await factory.CreateUserAsync();
        Assert.Contains(expected, await (await u.Client.PutJsonAsync("/api/me", req)).ErrorAsync());
    }

    [Fact]
    public async Task Add_and_delete_flaws()
    {
        var u = await factory.CreateUserAsync();
        var flaw = await (await u.Client.PostJsonAsync("/api/me/flaws", new CreateFlawRequest(FlawCategory.Money, "  Seven streaming subscriptions.  ")))
            .ReadAsync<FlawDto>();
        Assert.Equal(FlawCategory.Money, flaw.Category);
        Assert.Equal("Seven streaming subscriptions.", flaw.Text);

        var me = await (await u.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Single(me.Flaws, f => f.Id == flaw.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await u.Client.DeleteAsync($"/api/me/flaws/{flaw.Id}")).StatusCode);
        Assert.Empty((await (await u.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>()).Flaws);
    }

    [Fact]
    public async Task Flaws_come_back_in_the_order_they_were_added()
    {
        var u = await factory.CreateUserAsync(flaws: ["first flaw", "second flaw", "third flaw"]);
        var me = await (await u.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Equal(["first flaw", "second flaw", "third flaw"], me.Flaws.Select(f => f.Text));
    }

    [Fact]
    public async Task Cannot_delete_someone_elses_flaw()
    {
        var owner = await factory.CreateUserAsync(flaws: ["mine"]);
        var flawId = (await (await owner.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>()).Flaws[0].Id;
        var other = await factory.CreateUserAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.DeleteAsync($"/api/me/flaws/{flawId}")).StatusCode);
        Assert.Single((await (await owner.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>()).Flaws);
    }

    [Theory]
    [InlineData("ab", "3-280")]
    [InlineData("I'm a perfectionist", "compliment")]
    [InlineData("I tell people to kys", "crosses the line")]
    public async Task Flaw_validation(string text, string expected)
    {
        var u = await factory.CreateUserAsync();
        Assert.Contains(expected, await (await u.Client.PostJsonAsync("/api/me/flaws", new CreateFlawRequest(FlawCategory.Other, text))).ErrorAsync());
    }

    [Fact]
    public async Task Flaw_text_max_length()
    {
        var u = await factory.CreateUserAsync();
        var tooLong = new string('a', Limits.FlawMaxLength + 1);
        Assert.Contains("3-280", await (await u.Client.PostJsonAsync("/api/me/flaws", new CreateFlawRequest(FlawCategory.Other, tooLong))).ErrorAsync());
        var justRight = new string('a', Limits.FlawMaxLength);
        await (await u.Client.PostJsonAsync("/api/me/flaws", new CreateFlawRequest(FlawCategory.Other, justRight))).ReadAsync<FlawDto>();
    }

    [Fact]
    public async Task Flaw_count_is_capped()
    {
        var u = await factory.CreateUserAsync(flaws: Enumerable.Range(1, Limits.MaxFlaws).Select(i => $"flaw number {i}").ToArray());
        var error = await (await u.Client.PostJsonAsync("/api/me/flaws", new CreateFlawRequest(FlawCategory.Other, "one too many"))).ErrorAsync();
        Assert.Contains($"Max {Limits.MaxFlaws}", error);
    }

    [Fact]
    public async Task Photo_upload_replaces_the_previous_photo()
    {
        var u = await factory.CreateUserAsync();

        var first = await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/jpeg"))).ReadAsync<PhotoUploadResponse>();
        Assert.StartsWith("https://photos.test/", first.PhotoUrl);
        Assert.EndsWith(".jpg", first.PhotoUrl);
        var firstName = first.PhotoUrl.Split('/')[^1];
        Assert.True(factory.Photos.Files.ContainsKey(firstName));

        var second = await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/png"))).ReadAsync<PhotoUploadResponse>();
        Assert.EndsWith(".jpg", second.PhotoUrl); // everything is re-encoded as JPEG
        Assert.False(factory.Photos.Files.ContainsKey(firstName)); // old one cleaned up

        var me = await (await u.Client.GetAsync("/api/me")).ReadAsync<ProfileDto>();
        Assert.Equal(second.PhotoUrl, me.PhotoUrl);
    }

    [Theory]
    [InlineData("application/pdf", 100, "JPEG, PNG")]
    [InlineData("image/gif", 100, "JPEG, PNG")]
    [InlineData("image/heic", 100, "JPEG, PNG")]
    [InlineData("image/jpeg", 100, "doesn't look like a photo")] // claims to be a JPEG, isn't
    [InlineData("image/jpeg", 0, "8 MB")]
    [InlineData("image/jpeg", 8 * 1024 * 1024 + 1, "8 MB")]
    public async Task Photo_upload_validation(string contentType, int bytes, string expected)
    {
        var u = await factory.CreateUserAsync();
        Assert.Contains(expected, await (await u.Client.PostAsync("/api/me/photo", Image(contentType, bytes))).ErrorAsync());
    }

    [Fact]
    public async Task Photo_upload_strips_location_and_other_hidden_data()
    {
        var u = await factory.CreateUserAsync();
        var res = await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/jpeg", withGps: true))).ReadAsync<PhotoUploadResponse>();

        using var stored = new ImageMagick.MagickImage(factory.Photos.Files[res.PhotoUrl.Split('/')[^1]]);
        Assert.Equal(ImageMagick.MagickFormat.Jpeg, stored.Format);
        Assert.Null(stored.GetExifProfile());
        Assert.Null(stored.GetXmpProfile());
        Assert.Null(stored.GetIptcProfile());
    }

    [Fact]
    public async Task Photo_upload_applies_rotation_and_shrinks_huge_photos()
    {
        var u = await factory.CreateUserAsync();
        // 4000x1000 stored sideways (EXIF orientation 6 = rotate 90).
        var res = await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/jpeg", 4000, 1000, orientation: 6))).ReadAsync<PhotoUploadResponse>();

        using var stored = new ImageMagick.MagickImage(factory.Photos.Files[res.PhotoUrl.Split('/')[^1]]);
        Assert.Equal(400u, stored.Width);
        Assert.Equal(1600u, stored.Height);
    }

    [Fact]
    public async Task Small_photos_are_not_enlarged()
    {
        var u = await factory.CreateUserAsync();
        var res = await (await u.Client.PostAsync("/api/me/photo", TestHelpers.Photo("image/webp", 64, 48))).ReadAsync<PhotoUploadResponse>();
        using var stored = new ImageMagick.MagickImage(factory.Photos.Files[res.PhotoUrl.Split('/')[^1]]);
        Assert.Equal((64u, 48u), (stored.Width, stored.Height));
    }

    private static MultipartFormDataContent Image(string contentType, int bytes)
    {
        var file = new ByteArrayContent(new byte[bytes]);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", "photo" } };
    }
}
