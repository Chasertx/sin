using Npgsql;
using Sin.Api.Data;

namespace Sin.Api.Tests.Unit;

public class PostgresConnectionTests
{
    [Fact]
    public void Converts_supabase_pooler_uri()
    {
        var cs = PostgresConnection.Normalize(
            "postgresql://postgres.abcdef:p%40ss%3Aword@aws-0-us-east-1.pooler.supabase.com:5432/postgres");
        var b = new NpgsqlConnectionStringBuilder(cs);

        Assert.Equal("aws-0-us-east-1.pooler.supabase.com", b.Host);
        Assert.Equal(5432, b.Port);
        Assert.Equal("postgres", b.Database);
        Assert.Equal("postgres.abcdef", b.Username);
        Assert.Equal("p@ss:word", b.Password); // URL-encoded characters decoded
        Assert.Equal(SslMode.Require, b.SslMode);
    }

    [Fact]
    public void Accepts_postgres_scheme_and_defaults()
    {
        var b = new NpgsqlConnectionStringBuilder(PostgresConnection.Normalize("postgres://user:pw@db.example.com"));
        Assert.Equal(5432, b.Port);
        Assert.Equal("postgres", b.Database);
    }

    [Fact]
    public void Honors_sslmode_query_parameter()
    {
        var b = new NpgsqlConnectionStringBuilder(
            PostgresConnection.Normalize("postgresql://u:p@localhost:5433/app?sslmode=disable"));
        Assert.Equal(SslMode.Disable, b.SslMode);
        Assert.Equal(5433, b.Port);
        Assert.Equal("app", b.Database);
    }

    [Fact]
    public void Leaves_keyvalue_strings_untouched()
    {
        const string cs = "Host=localhost;Username=u;Password=p;Database=d";
        Assert.Equal(cs, PostgresConnection.Normalize(cs));
    }
}
