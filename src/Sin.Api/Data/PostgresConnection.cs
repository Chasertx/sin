using Npgsql;

namespace Sin.Api.Data;

public static class PostgresConnection
{
    /// <summary>
    /// Accepts either Npgsql "Host=...;Username=..." format or the postgresql://user:pass@host:port/db
    /// URI that Supabase/Neon/Render show, and returns the Npgsql format with SSL required.
    /// </summary>
    public static string Normalize(string value)
    {
        if (!value.StartsWith("postgres://") && !value.StartsWith("postgresql://"))
            return value;

        var uri = new Uri(value);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = uri.AbsolutePath.Trim('/') is { Length: > 0 } db ? db : "postgres",
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null,
            // Hosted Postgres needs SSL; a local dev server can opt out with ?sslmode=disable.
            SslMode = SslMode.Require,
        };
        var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
        if (Enum.TryParse<SslMode>(query["sslmode"], ignoreCase: true, out var ssl))
            builder.SslMode = ssl;
        return builder.ConnectionString;
    }
}
