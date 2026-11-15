using ImageMagick;
using ImageMagick.Drawing;
using Microsoft.EntityFrameworkCore;
using Sin.Api.Data;
using Sin.Shared;

namespace Sin.Api.Services;

/// <summary>
/// Practice accounts: a way to try every part of Ick on the live service without real people seeing
/// test data, and without the tester needing real people to match with.
///
/// Anyone who registers with an email at the practice domain (setting Practice:EmailDomain, e.g.
/// "ick.test": a domain that can never receive mail) gets a private world: a filled-in profile, a
/// cast of made-up people in Discover, current matches with a conversation, and ended matches going
/// back a few months. The cast belongs to that one account (<see cref="User.PracticeOwnerId"/>),
/// can't sign in, and is deleted with it. Real members never see practice accounts or their cast,
/// and a practice account never sees real members.
/// </summary>
public class PracticeAccounts(IConfiguration config)
{
    private readonly string? _suffix =
        (config["Practice:EmailDomain"] ?? "").Trim().TrimStart('@').ToLowerInvariant() is { Length: > 0 } domain ? "@" + domain : null;

    /// <summary>Each practice account costs a dozen rows and a few photos, so there's a ceiling.</summary>
    public int MaxAccounts { get; } = config.GetValue("Practice:MaxAccounts", 25);

    public bool IsPracticeEmail(string email) => _suffix is not null && email.EndsWith(_suffix, StringComparison.OrdinalIgnoreCase);

    /// <summary>A person trying the app out (as opposed to one of the made-up people in their world).</summary>
    public bool IsTester(User user) => user.PracticeOwnerId is null && IsPracticeEmail(user.Email);

    public Task<int> CountAsync(SinDb db) =>
        _suffix is { } suffix ? db.Users.CountAsync(u => u.PracticeOwnerId == null && u.Email.EndsWith(suffix)) : Task.FromResult(0);

    /// <summary>Narrows a query to the people <paramref name="me"/> is allowed to come across.</summary>
    public IQueryable<User> VisibleTo(User me, IQueryable<User> people)
    {
        var myId = me.Id;
        if (IsTester(me)) return people.Where(u => u.PracticeOwnerId == myId);
        people = people.Where(u => u.PracticeOwnerId == null);
        return _suffix is { } suffix ? people.Where(u => !u.Email.EndsWith(suffix)) : people;
    }

    public bool CanSee(User me, User other) =>
        IsTester(me) ? other.PracticeOwnerId == me.Id : other.PracticeOwnerId is null && !IsPracticeEmail(other.Email);

    // ---- The made-up people ----

    private enum Role { Discover, LikesYou, Current, Ended }

    /// <param name="Miles">How far from the tester they live, so the distance filter has something to bite on.</param>
    /// <param name="Photo">Background colour of their placeholder picture; null for no photo.</param>
    private record Person(string Name, int Age, Gender Gender, int Height, Ethnicity Ethnicity, double Miles, double Bearing,
        Role Role, string? Photo, string Headline, params (FlawCategory Category, string Text)[] Flaws);

    private static readonly Person[] Cast =
    [
        new("Maya", 27, Gender.Woman, 65, Ethnicity.HispanicLatino, 3, 40, Role.Current, "#BFE3D6", "I will read your texts out loud in a funny voice.",
            (FlawCategory.Habits, "I start four shows at once and finish none of them."),
            (FlawCategory.Money, "I buy candles like I am preparing for a blackout.")),
        new("Devon", 31, Gender.Man, 72, Ethnicity.Black, 8, 130, Role.Current, "#C9DDE6", "I am late to everything, including this.",
            (FlawCategory.Temper, "I take board games far too seriously."),
            (FlawCategory.Quirks, "I alphabetize the spice rack at other people's houses.")),
        new("Brooke", 34, Gender.Woman, 67, Ethnicity.White, 20, 220, Role.Ended, null, "I give directions using landmarks that closed years ago.",
            (FlawCategory.Baggage, "I bring up my college roommate in every conversation.")),
        new("Elliot", 29, Gender.NonBinary, 69, Ethnicity.Asian, 60, 300, Role.Ended, null, "I correct movie trivia nobody asked about.",
            (FlawCategory.Quirks, "I clap when the plane lands. Every time.")),
        new("Sasha", 38, Gender.Woman, 63, Ethnicity.MiddleEastern, 150, 10, Role.Ended, null, "I have opinions about how you load the dishwasher.",
            (FlawCategory.Dealbreaker, "I put ketchup on everything, including eggs.")),
        new("Harper", 30, Gender.Woman, 66, Ethnicity.SouthAsian, 5, 80, Role.LikesYou, "#E3DCC3", "I sing the wrong lyrics with total confidence.",
            (FlawCategory.Money, "I owe my sister forty dollars since 2019."),
            (FlawCategory.Habits, "I hit snooze nine times and blame the alarm.")),
        new("Jo", 25, Gender.NonBinary, 68, Ethnicity.PacificIslander, 14, 170, Role.LikesYou, null, "I narrate what my cat is thinking.",
            (FlawCategory.Hygiene, "My car is a second closet and a third trash can."),
            (FlawCategory.Other, "I talk to the self-checkout machine.")),
        new("Nico", 33, Gender.Man, 70, Ethnicity.HispanicLatino, 27, 250, Role.Discover, "#D9CFE6", "I have started a podcast three times.",
            (FlawCategory.Baggage, "I still text my old band group chat about a reunion."),
            (FlawCategory.Temper, "I argue with automated phone menus."),
            (FlawCategory.Hygiene, "I re-wear socks if they pass the test.")),
        new("Imani", 41, Gender.Woman, 74, Ethnicity.Black, 48, 330, Role.Discover, null, "I cancel plans the moment they are made.",
            (FlawCategory.Habits, "I leave cabinet doors open everywhere I go."),
            (FlawCategory.Dealbreaker, "I think pineapple belongs on every pizza.")),
        // Outside a practice account's starting age filter (21 to 45): shows up once the filter is widened.
        new("Theo", 52, Gender.Man, 61, Ethnicity.White, 95, 110, Role.Discover, null, "I explain the plot of movies while we are watching them.",
            (FlawCategory.Money, "I have four streaming services and watch the same two shows.")),
        new("Wes", 36, Gender.Man, 77, Ethnicity.NativeAmerican, 320, 200, Role.Discover, null, "I treat every yellow light as a personal challenge.",
            (FlawCategory.Temper, "I get furious at slow walkers.")),
    ];

    private static readonly (FlawCategory Category, string Text)[] MyConfessions =
    [
        (FlawCategory.Habits, "I leave exactly one sip in every drink and put it back in the fridge."),
        (FlawCategory.Baggage, "I still have my ex's streaming profile and I check what they watch."),
        (FlawCategory.Hygiene, "I consider a shower optional on Sundays."),
        (FlawCategory.Money, "I have paid for a gym membership since 2021 and been twice."),
        (FlawCategory.Temper, "I honk at people who wave me through too slowly."),
        (FlawCategory.Quirks, "I name my houseplants and hold grudges when they die."),
        (FlawCategory.Dealbreaker, "I will not share fries. I will order you your own."),
        (FlawCategory.Other, "I reply to texts in my head and never actually send them."),
    ];

    /// <summary>
    /// Fills in a brand-new practice account and builds its world. Dates are set relative to now, so the
    /// History timeline covers the last three months whenever the account is made.
    /// </summary>
    public async Task PopulateAsync(SinDb db, User me, IPhotoStore photos)
    {
        var now = DateTime.UtcNow;

        me.Headline ??= "I narrate my own parallel parking, badly.";
        me.HeightInches ??= 70;
        me.Ethnicity ??= Ethnicity.Multiracial;
        if (!me.HasLocation) (me.Latitude, me.Longitude, me.LocatedAt) = (40.71, -74.01, now); // New York, until the phone says otherwise
        (me.PrefMinAge, me.PrefMaxAge) = (21, 45);
        for (var i = 0; i < MyConfessions.Length; i++)
            db.Flaws.Add(new Flaw { UserId = me.Id, Category = MyConfessions[i].Category, Text = MyConfessions[i].Text, CreatedAt = now.AddSeconds(i) });
        me.PhotoFile = await SavePlaceholderAsync(photos, me.Id, "#D8ECE4");

        var people = new Dictionary<string, User>();
        foreach (var p in Cast)
        {
            var person = new User
            {
                Email = $"practice-{Guid.NewGuid():N}{_suffix}",
                PasswordHash = null, // nobody can sign in as one of these
                DisplayName = p.Name,
                Age = p.Age,
                // Whoever the tester is looking for, these people fit, and they're open to the tester.
                Gender = me.InterestedIn switch { InterestedIn.Men => Gender.Man, InterestedIn.Women => Gender.Woman, _ => p.Gender },
                InterestedIn = InterestedIn.Everyone,
                Headline = p.Headline,
                HeightInches = p.Height,
                Ethnicity = p.Ethnicity,
                PracticeOwnerId = me.Id,
                LocatedAt = now,
                Flaws = p.Flaws.Select((f, i) => new Flaw { Category = f.Category, Text = f.Text, CreatedAt = now.AddSeconds(i) }).ToList(),
            };
            PlaceNear(me, person, p);
            if (p.Photo is { } background) person.PhotoFile = await SavePlaceholderAsync(photos, person.Id, background);
            db.Users.Add(person);
            people[p.Name] = person;
        }

        void Liked(User from, User to, DateTime at) =>
            db.Swipes.Add(new Swipe { SwiperId = from.Id, TargetId = to.Id, CanLiveWithIt = true, CreatedAt = at });

        Match Current(string name, DateTime matched)
        {
            var other = people[name];
            Liked(me, other, matched);
            Liked(other, me, matched);
            var match = new Match { UserAId = me.Id, UserBId = other.Id, CreatedAt = matched };
            db.Matches.Add(match);
            return match;
        }

        void Ended(string? name, DateTime matched, DateTime ended, bool byMe)
        {
            var other = name is null ? null : people[name];
            if (other is not null)
            {
                // Already swiped on, so they don't come round again in Discover.
                Liked(me, other, matched);
                Liked(other, me, matched);
            }
            db.PastMatches.Add(new PastMatch
            {
                UserId = me.Id,
                OtherUserId = other?.Id,
                OtherName = other?.DisplayName,
                MatchedAt = matched,
                EndedAt = ended,
                EndedByMe = byMe,
            });
        }

        // Someone who has since deleted their account, then one of each way a match can end.
        Ended(null, now.AddDays(-85), now.AddDays(-73), byMe: false);
        Ended("Brooke", now.AddDays(-62), now.AddDays(-46), byMe: true);                 // you unmatched
        Ended("Elliot", now.AddDays(-41), now.AddDays(-41).AddHours(20), byMe: false);    // they unmatched
        Ended("Sasha", now.AddDays(-28), now.AddDays(-28).AddHours(2), byMe: true);       // you blocked
        db.Blocks.Add(new Block { BlockerId = me.Id, BlockedId = people["Sasha"].Id, CreatedAt = now.AddDays(-28).AddHours(2) });

        var maya = Current("Maya", now.AddDays(-13));
        Current("Devon", now.AddHours(-20)); // a new match nobody has written to yet
        (User From, string Text, DateTime At)[] chat =
        [
            (people["Maya"], "Okay, the fries thing. Is that negotiable?", maya.CreatedAt.AddMinutes(11)),
            (me, "Absolutely not. I will buy you a large though.", maya.CreatedAt.AddMinutes(14)),
            (people["Maya"], "Generous. I respect a person with boundaries.", maya.CreatedAt.AddMinutes(32)),
            (me, "How many candles are we talking, exactly?", now.AddDays(-6)),
            (people["Maya"], "Enough that the fire marshal knows my name.", now.AddDays(-6).AddMinutes(5)),
            (me, "Honestly that I can handle.", now.AddDays(-2)),
        ];
        foreach (var (from, text, at) in chat)
            db.Messages.Add(new Message { MatchId = maya.Id, SenderId = from.Id, Text = text, SentAt = at });

        // These two have already said yes: swiping right on either is an instant match.
        foreach (var p in Cast.Where(p => p.Role == Role.LikesYou))
            Liked(people[p.Name], me, now.AddDays(-1));

        await db.SaveChangesAsync();
    }

    /// <summary>The tester's phone reported where it really is: keep everyone the same distance away as before.</summary>
    public async Task RelocateAsync(SinDb db, User me)
    {
        var people = await db.Users.Where(u => u.PracticeOwnerId == me.Id).ToListAsync();
        foreach (var person in people)
            if (Cast.FirstOrDefault(p => p.Name == person.DisplayName) is { } p)
                PlaceNear(me, person, p);
    }

    /// <summary>Removes a practice account's made-up people once the account itself has been deleted.</summary>
    public async Task RemoveWorldAsync(SinDb db, Guid testerId, IPhotoStore photos)
    {
        var people = await db.Users.Where(u => u.PracticeOwnerId == testerId).Select(u => new { u.Id, u.PhotoFile }).ToListAsync();
        if (people.Count == 0) return;
        var ids = people.Select(p => p.Id).ToList();

        await db.PastMatches.Where(p => ids.Contains(p.UserId)).ExecuteDeleteAsync();
        await db.Swipes.Where(s => ids.Contains(s.SwiperId) || ids.Contains(s.TargetId)).ExecuteDeleteAsync();
        await db.Blocks.Where(b => ids.Contains(b.BlockerId) || ids.Contains(b.BlockedId)).ExecuteDeleteAsync();
        await db.Flaws.Where(f => ids.Contains(f.UserId)).ExecuteDeleteAsync();
        await db.Users.Where(u => u.PracticeOwnerId == testerId).ExecuteDeleteAsync();
        foreach (var file in people.Select(p => p.PhotoFile).OfType<string>())
        {
            try { await photos.DeleteAsync(file); } catch { /* best effort */ }
        }
    }

    private static void PlaceNear(User me, User person, Person p)
    {
        var bearing = p.Bearing * Math.PI / 180;
        var lat = me.Latitude!.Value;
        var milesPerDegreeLng = UsGeo.MilesPerDegree * Math.Max(0.2, Math.Cos(lat * Math.PI / 180));
        person.Latitude = Math.Clamp(lat + p.Miles * Math.Cos(bearing) / UsGeo.MilesPerDegree, -89, 89);
        person.Longitude = me.Longitude!.Value + p.Miles * Math.Sin(bearing) / milesPerDegreeLng;
    }

    /// <summary>A plain head-and-shoulders placeholder, so no made-up person has a real face.</summary>
    internal static byte[] Placeholder(string background)
    {
        using var image = new MagickImage(new MagickColor(background), 600, 600);
        new Drawables()
            .FillColor(new MagickColor("#647A72"))
            .Ellipse(300, 230, 115, 115, 0, 360)   // head
            .Ellipse(300, 640, 225, 265, 0, 360)   // shoulders
            .Draw(image);
        image.Format = MagickFormat.Jpeg;
        image.Quality = 85;
        return image.ToByteArray();
    }

    /// <returns>The stored file name, or null if the picture couldn't be saved (the account is made anyway).</returns>
    private static async Task<string?> SavePlaceholderAsync(IPhotoStore photos, Guid userId, string background)
    {
        try
        {
            var name = $"{userId:N}-{DateTime.UtcNow.Ticks}.jpg";
            using var jpeg = new MemoryStream(Placeholder(background));
            await photos.SaveAsync(name, jpeg, "image/jpeg");
            return name;
        }
        catch
        {
            return null;
        }
    }
}
