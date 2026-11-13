using Microsoft.Extensions.Configuration;
using Sin.Api.Services;

namespace Sin.Api.Tests.Unit;

public class LoginThrottleTests
{
    private sealed class FakeClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static (LoginThrottle Throttle, FakeClock Clock) Make(int max = 3, int minutes = 10)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:LoginLockout:MaxFailures"] = max.ToString(),
            ["Security:LoginLockout:WindowMinutes"] = minutes.ToString(),
        }).Build();
        var clock = new FakeClock();
        return (new LoginThrottle(config, clock), clock);
    }

    [Fact]
    public void Locks_after_max_failures_and_reports_remaining_time()
    {
        var (t, clock) = Make();
        for (var i = 0; i < 2; i++) t.RecordFailure("a@b.c");
        Assert.Null(t.LockedFor("a@b.c"));
        t.RecordFailure("a@b.c");
        clock.Now = clock.Now.AddMinutes(4);
        Assert.Equal(TimeSpan.FromMinutes(6), t.LockedFor("a@b.c"));
    }

    [Fact]
    public void Unlocks_when_the_window_passes()
    {
        var (t, clock) = Make();
        for (var i = 0; i < 3; i++) t.RecordFailure("a@b.c");
        clock.Now = clock.Now.AddMinutes(10);
        Assert.Null(t.LockedFor("a@b.c"));
    }

    [Fact]
    public void Old_failures_do_not_count_toward_a_new_window()
    {
        var (t, clock) = Make();
        t.RecordFailure("a@b.c");
        t.RecordFailure("a@b.c");
        clock.Now = clock.Now.AddMinutes(11);
        t.RecordFailure("a@b.c");
        Assert.Null(t.LockedFor("a@b.c"));
    }

    [Fact]
    public void Emails_are_normalized_and_reset_clears()
    {
        var (t, _) = Make();
        for (var i = 0; i < 3; i++) t.RecordFailure(" A@B.c ");
        Assert.NotNull(t.LockedFor("a@b.c"));
        t.Reset("a@B.C");
        Assert.Null(t.LockedFor("a@b.c"));
    }

    [Fact]
    public void Defaults_are_five_attempts_per_fifteen_minutes()
    {
        var t = new LoginThrottle(new ConfigurationBuilder().Build(), TimeProvider.System);
        Assert.Equal(5, t.MaxFailures);
        Assert.Equal(TimeSpan.FromMinutes(15), t.Window);
    }
}
