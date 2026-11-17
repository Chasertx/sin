using Microsoft.EntityFrameworkCore;
using Sin.Shared;

namespace Sin.Api.Data;

public class SinDb(DbContextOptions<SinDb> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Flaw> Flaws => Set<Flaw>();
    public DbSet<Swipe> Swipes => Set<Swipe>();
    public DbSet<Match> Matches => Set<Match>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<PastMatch> PastMatches => Set<PastMatch>();
    public DbSet<ExternalLogin> ExternalLogins => Set<ExternalLogin>();
    public DbSet<Block> Blocks => Set<Block>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<EmailVerificationToken> EmailVerificationTokens => Set<EmailVerificationToken>();

    // SQLite has no timezone-aware type; everything we store is UTC, so mark it as such on read.
    protected override void ConfigureConventions(ModelConfigurationBuilder c) =>
        c.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();

    private class UtcDateTimeConverter() : Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTime, DateTime>(
        v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

    /// <summary>
    /// On Postgres all tables live in the "app" schema, not "public". Supabase's Data API
    /// (PostgREST) only exposes "public", so this keeps password hashes, messages, etc.
    /// unreachable with the project's public key.
    /// </summary>
    public const string PostgresSchema = "app";

    protected override void OnModelCreating(ModelBuilder b)
    {
        if (Database.IsNpgsql()) b.HasDefaultSchema(PostgresSchema);

        b.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).HasMaxLength(256);
            e.Property(u => u.DisplayName).HasMaxLength(50);
            e.Property(u => u.Headline).HasMaxLength(Limits.HeadlineMaxLength);
            e.Property(u => u.Gender).HasConversion<string>();
            e.Property(u => u.InterestedIn).HasConversion<string>();
            e.Property(u => u.Ethnicity).HasConversion<string>().HasMaxLength(32);
            e.Property(u => u.PrefEthnicities).HasMaxLength(256);
            e.HasMany(u => u.Flaws).WithOne().HasForeignKey(f => f.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(u => u.ExternalLogins).WithOne().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.Ignore(u => u.NeedsOnboarding);
            e.Ignore(u => u.HasLocation);
        });

        b.Entity<ExternalLogin>(e =>
        {
            e.HasKey(x => new { x.Provider, x.Subject });
            e.Property(x => x.Provider).HasMaxLength(32);
            e.Property(x => x.Subject).HasMaxLength(256);
        });

        b.Entity<Block>(e =>
        {
            e.HasKey(x => new { x.BlockerId, x.BlockedId });
            e.HasIndex(x => x.BlockedId);
        });

        b.Entity<Report>(e =>
        {
            e.Property(x => x.Reason).HasConversion<string>();
            e.Property(x => x.Status).HasConversion<string>();
            e.Property(x => x.Details).HasMaxLength(Limits.ReportDetailsMaxLength);
            e.HasIndex(x => x.Status);
        });

        b.Entity<Flaw>(e =>
        {
            e.Property(f => f.Text).HasMaxLength(Limits.FlawMaxLength);
            e.Property(f => f.Category).HasConversion<string>();
        });

        b.Entity<Swipe>(e =>
        {
            e.HasKey(s => new { s.SwiperId, s.TargetId });
            e.HasIndex(s => s.TargetId);
        });

        b.Entity<Match>(e =>
        {
            e.HasIndex(m => m.UserAId);
            e.HasIndex(m => m.UserBId);
            e.HasMany(m => m.Messages).WithOne().HasForeignKey(x => x.MatchId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<PastMatch>(e =>
        {
            e.Property(p => p.OtherName).HasMaxLength(50);
            e.HasIndex(p => p.UserId);
            e.HasIndex(p => p.OtherUserId);
        });

        b.Entity<Message>(e =>
        {
            e.Property(x => x.Text).HasMaxLength(Limits.MessageMaxLength);
            e.HasIndex(x => new { x.MatchId, x.Id });
        });

        b.Entity<EmailVerificationToken>(e =>
        {
            e.Property(x => x.Token).HasMaxLength(256);
            e.HasIndex(x => new { x.UserId, x.Token });
            e.HasIndex(x => x.ExpiresAt);
        });
    }
}
