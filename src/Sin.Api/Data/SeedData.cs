using Sin.Shared;

namespace Sin.Api.Data;

/// <summary>Demo users so the feed isn't empty on first run. Password for all: password123</summary>
public static class SeedData
{
    /// <summary>Where each demo person lives (spread across the US), plus the optional profile details.</summary>
    private static readonly Dictionary<string, (double Lat, double Lng, int Height, Ethnicity? Ethnicity)> Details = new()
    {
        ["Dana"] = (40.71, -74.01, 65, Ethnicity.White),             // New York
        ["Marcus"] = (41.88, -87.63, 72, Ethnicity.Black),           // Chicago
        ["Priya"] = (30.27, -97.74, 63, Ethnicity.SouthAsian),       // Austin
        ["Leo"] = (34.05, -118.24, 70, Ethnicity.HispanicLatino),    // Los Angeles
        ["Sam"] = (47.61, -122.33, 67, null),                        // Seattle
        ["Jess"] = (39.74, -104.99, 66, Ethnicity.Asian),            // Denver
        ["Tom"] = (25.76, -80.19, 71, Ethnicity.White),              // Miami
        ["Alex"] = (33.75, -84.39, 64, Ethnicity.Multiracial),       // Atlanta
    };

    public static void Seed(SinDb db)
    {
        var existing = db.Users.Where(u => u.IsDemo).ToList();
        if (existing.Count > 0)
        {
            // Demo people created before locations existed would be invisible now: fill them in.
            foreach (var u in existing.Where(u => !u.HasLocation)) Describe(u);
            db.SaveChanges();
            return;
        }

        var hash = BCrypt.Net.BCrypt.HashPassword("password123");

        User Make(string name, int age, Gender g, InterestedIn i, string headline, params (FlawCategory c, string t)[] flaws) => Describe(new()
        {
            Email = $"{name.ToLowerInvariant()}@demo.sin",
            PasswordHash = hash,
            DisplayName = name,
            Age = age,
            Gender = g,
            InterestedIn = i,
            Headline = headline,
            IsDemo = true,
            Flaws = flaws.Select(f => new Flaw { Category = f.c, Text = f.t }).ToList()
        });

        db.Users.AddRange(
            Make("Dana", 29, Gender.Woman, InterestedIn.Everyone, "I will read your texts out loud to my group chat.",
                (FlawCategory.Habits, "I leave exactly one sip in every glass and put it back in the fridge."),
                (FlawCategory.Temper, "I hold grudges against restaurants for a decade."),
                (FlawCategory.Money, "Seven streaming subscriptions. I watch one.")),
            Make("Marcus", 33, Gender.Man, InterestedIn.Everyone, "Still not over my 2014 fantasy football loss.",
                (FlawCategory.Hygiene, "I consider deodorant a weekend thing."),
                (FlawCategory.Baggage, "My ex and I share a dog and a lot of feelings about the dog."),
                (FlawCategory.Quirks, "I narrate my own life in the third person when I'm stressed.")),
            Make("Priya", 26, Gender.Woman, InterestedIn.Men, "I reply to texts 3-5 business days later.",
                (FlawCategory.Habits, "I've had 40 unread voicemails since 2021."),
                (FlawCategory.Dealbreaker, "Pineapple on pizza is the only correct pizza and I will not discuss it."),
                (FlawCategory.Quirks, "I name every plant I own and they all die.")),
            Make("Leo", 31, Gender.Man, InterestedIn.Women, "I've started a podcast. Three times.",
                (FlawCategory.Money, "I bought a $900 espresso machine and still go to Starbucks."),
                (FlawCategory.Temper, "I've rage-quit board games with my grandmother."),
                (FlawCategory.Habits, "My car is a second closet. And pantry.")),
            Make("Sam", 28, Gender.NonBinary, InterestedIn.Everyone, "I explain the plot of movies while we're watching them.",
                (FlawCategory.Quirks, "I clap when the plane lands. Every time."),
                (FlawCategory.Baggage, "Still emotionally recovering from a Tamagotchi death in 2003.")),
            Make("Jess", 35, Gender.Woman, InterestedIn.Everyone, "I have opinions about your font choices.",
                (FlawCategory.Habits, "I spoil movie endings by accident. Mostly by accident."),
                (FlawCategory.Hygiene, "I re-wear socks if they 'pass the test'."),
                (FlawCategory.Money, "My credit score has seen things.")),
            Make("Tom", 30, Gender.Man, InterestedIn.Everyone, "Will bring up crypto on the first date.",
                (FlawCategory.Dealbreaker, "I own a hoverboard and I ride it indoors."),
                (FlawCategory.Temper, "I argue with automated phone menus.")),
            Make("Alex", 27, Gender.Woman, InterestedIn.Everyone, "I chew ice. Loudly. Constantly.",
                (FlawCategory.Habits, "I keep 214 browser tabs open and each one is important."),
                (FlawCategory.Quirks, "I talk to my cat in a voice I would never use on a human."),
                (FlawCategory.Baggage, "I have a whole binder about why my last relationship ended."))
        );
        db.SaveChanges();
    }

    private static User Describe(User u)
    {
        if (!Details.TryGetValue(u.DisplayName, out var d)) return u;
        (u.Latitude, u.Longitude, u.LocatedAt) = (d.Lat, d.Lng, DateTime.UtcNow);
        u.HeightInches ??= d.Height;
        u.Ethnicity ??= d.Ethnicity;
        return u;
    }
}
